import { createSignal, createEffect, createMemo, onMount, onCleanup, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"
import fuzzysort from "fuzzysort"
import { ScrollBoxRenderable } from "@opentui/core"
import { Dialog } from "./Dialog"
import { DialogHeader, dialogScrollbarOptions } from "./DialogControls"
import { useTheme } from "../context/ThemeContext"
import { selectedForeground } from "../lib/theme-resolver"
import { truncate } from "../lib/format"
import { t } from "../lib/i18n"
import { scrollTopToRevealIndex } from "../lib/scroll-into-view"

/**
 * Max list rows before scrolling; 14 fits the full command palette.
 *
 * The palette registers 13 commands (more with --chaos / --debug), so at this
 * cap every command is visible without scrolling.
 */
const MAX_LIST_ROWS = 14

/**
 * Rows the surrounding chrome can occupy outside the scrollbox: the dialog's
 * own vertical padding, the header (title + gap), the search block (input +
 * its paddings + gap) and the footer (gap + its hint rows).
 *
 * This is the WORST CASE, not the typical one: the footer grows when the
 * selected option's hint wraps, so the chrome is one row taller in some
 * dialogs than in others. The list itself does not depend on it — the
 * scrollbox below is given an explicit height — so the dialog only has to
 * leave room for the tallest chrome, and any row left over is slack.
 *
 * Getting this wrong is what silently clipped list entries: the command
 * palette hid "About" and "Quit OCLoop", and the terminal dialog hid its
 * "Custom…" option — the only route to a custom terminal command.
 */
const DIALOG_CHROME_ROWS = 10

export interface DialogSelectOption {
  title: string
  value: string
  footer?: string
  category?: string
  /** Direct keyboard shortcut for this option, shown as a dim right-aligned
   * badge so the palette teaches the shortcuts. Optional; only command-palette
   * options set it. */
  keybind?: string
  disabled?: boolean
  onSelect?: () => void
}

export interface DialogKeybind {
  label: string
  key: string
  onSelect?: () => void
  bind?: string | string[]
}

export interface DialogSelectProps {
  title: string
  placeholder?: string
  options: DialogSelectOption[]
  onSelect?: (option: DialogSelectOption) => void
  onMove?: (option: DialogSelectOption | undefined) => void
  onFilter?: (filtered: DialogSelectOption[]) => void
  skipFilter?: boolean
  current?: string
  keybinds?: DialogKeybind[]
  onClose: () => void
}

export function DialogSelect(props: DialogSelectProps) {
  const { theme } = useTheme()
  const [search, setSearch] = createSignal("")
  const [filteredOptions, setFilteredOptions] = createSignal<DialogSelectOption[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const listRows = createMemo(() => {
    const count = filteredOptions().length
    return count === 0 ? 1 : Math.min(count, MAX_LIST_ROWS)
  })
  const needsScroll = createMemo(() => filteredOptions().length > MAX_LIST_ROWS)
  let scroll: ScrollBoxRenderable | undefined

  let input: InputRenderable | undefined

  /**
   * Scroll the selected option into view.
   *
   * The scrollbox has no laid-out viewport until the renderer's first layout
   * pass, and a scroll issued before that is dropped (its bounds are still
   * zero) — so the selection silently stays off-screen. The routing picker
   * opened on a catalog of dozens of models with the current one nowhere in
   * sight. Wait for the layout instead of guessing with a fixed delay.
   */
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  const scheduleReveal = (index: number) => {
    if (revealTimer) clearTimeout(revealTimer)
    let attempts = 0
    const attempt = () => {
      if (!scroll || scroll.scrollHeight <= 0 || scroll.viewport.height <= 0) {
        if (attempts++ < 40) revealTimer = setTimeout(attempt, 16)
        return
      }
      reveal(index)
    }
    attempt()
  }
  onCleanup(() => {
    if (revealTimer) clearTimeout(revealTimer)
  })

  onMount(() => {
    const timer = setTimeout(() => {
      input?.focus()
    }, 10)
    onCleanup(() => clearTimeout(timer))
  })

  // Filter options when search changes
  createEffect(() => {
    const query = search()
    
    const filtered = props.skipFilter || !query
      ? props.options
      : fuzzysort.go(query, props.options, {
        keys: ["title", "category"],
        threshold: -10000,
      }).map(r => r.obj)
    setFilteredOptions(filtered)
    props.onFilter?.(filtered)

    const currentIndex = query ? -1 : filtered.findIndex(o => o.value === props.current)
    const index = Math.max(0, currentIndex)
    setSelectedIndex(index)
    scroll?.scrollTo({ x: 0, y: 0 })
    scheduleReveal(index)
  })

  const reveal = (index: number) => {
    if (!scroll) return

    const target = scrollTopToRevealIndex({
      index,
      scrollTop: scroll.scrollTop,
      viewportHeight: scroll.viewport.height,
    })
    if (target !== null) {
      scroll.scrollTo({ x: 0, y: target })
    }
  }

  const moveTo = (index: number) => {
    setSelectedIndex(index)
    props.onMove?.(filteredOptions()[index])
    reveal(index)
  }

  const move = (direction: number) => {
    if (filteredOptions().length === 0) return
    let next = selectedIndex() + direction
    if (next < 0) next = filteredOptions().length - 1
    if (next >= filteredOptions().length) next = 0
    moveTo(next)
  }

  useKeyboard((key) => {
    if (key.defaultPrevented) return
    if (key.name === "escape") {
      key.preventDefault()
      props.onClose()
      return
    }

    if (key.name === "return") {
      key.preventDefault()
      const selected = filteredOptions()[selectedIndex()]
      if (selected && !selected.disabled) {
        if (selected.onSelect) selected.onSelect()
        if (props.onSelect) props.onSelect(selected)
      }
      return
    }

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      key.preventDefault()
      move(-1)
      return
    }

    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      key.preventDefault()
      move(1)
      return
    }

    if (key.name === "pageup") {
      key.preventDefault()
      if (filteredOptions().length === 0) return
      if (selectedIndex() === 0) {
        move(-1)  // wrap to last
      } else {
        moveTo(Math.max(0, selectedIndex() - 6))  // clamp
      }
      return
    }

    if (key.name === "pagedown") {
      key.preventDefault()
      // Guard the empty-list case: with 0 results, lastIndex = -1, so the
      // non-wrap branch below would call moveTo(-1), setting selectedIndex=-1
      // and invoking onMove(undefined). move() already early-returns on an
      // empty list; the pageup/pagedown handlers must too (the useKeyboard
      // handler stays live even though the list is hidden via <Show>).
      if (filteredOptions().length === 0) return
      const lastIndex = filteredOptions().length - 1
      if (selectedIndex() === lastIndex) {
        move(1)  // wrap to first
      } else {
        moveTo(Math.min(lastIndex, selectedIndex() + 6))  // clamp
      }
      return
    }

    // Check custom keybinds
    if (props.keybinds) {
      // Logic: Only check binds if it's NOT a regular typing character
      // Regular typing: no modifiers, single char, printable range
      const isTyping = !key.ctrl && !key.meta && key.sequence && key.sequence.length === 1 && 
                       key.sequence.charCodeAt(0) >= 32 && key.sequence.charCodeAt(0) <= 126

      if (!isTyping) {
        for (const kb of props.keybinds) {
          if (kb.onSelect && kb.bind) {
            const binds = Array.isArray(kb.bind) ? kb.bind : [kb.bind]
            if (binds.some(b => b === key.sequence || b === key.name)) {
              key.preventDefault()
              kb.onSelect()
              return
            }
          }
        }
      }
    }
  })



  return (
    <Dialog 
      onClose={props.onClose} 
      width={60} 
      height={DIALOG_CHROME_ROWS + listRows()}
    >
      {/* Header */}
      <DialogHeader title={props.title} />

      {/* Search Input */}
      <box style={{ 
        width: "100%", 
        paddingTop: 1, 
        paddingBottom: 1,
        marginBottom: 1
      }}>
        <input
          ref={input}
          value={search()}
          onInput={(v) => setSearch(v)}
          placeholder={props.placeholder || t("dlgSearchPlaceholder")}
          focusedBackgroundColor={theme().backgroundPanel}
          cursorColor={theme().primary}
          focusedTextColor={theme().textMuted}
          width="100%"
        />
      </box>

      {/* List */}
      <Show when={filteredOptions().length > 0} fallback={
        <box style={{ flexGrow: 1 }}>
          <text>
             <span style={{ fg: theme().textMuted }}>{t("dlgNoResults")}</span>
          </text>
        </box>
      }>
        {/*
         * The list gets an EXPLICIT height instead of growing into whatever
         * space the chrome leaves: that way every entry stays visible no
         * matter how tall the footer turns out to be, and the list scrolls
         * only when it holds more entries than the cap.
         */}
        <scrollbox
          ref={(r) => scroll = r}
          height={listRows()}
          flexShrink={0}
          maxHeight={listRows()}
          verticalScrollbarOptions={dialogScrollbarOptions(theme(), {
            autoHide: !needsScroll(),
          })}
          flexGrow={1}
          // Root stays `row` ([ content | scrollbar ]). flexDirection: "column"
          // stacks the bar below the list at full width (ActivityLog split-screen bug).
        >
          <For each={filteredOptions()}>
            {(option, i) => {
              // Per-row derived styles: one memo per row so a selectedIndex change
              // only re-evaluates the row that flipped. The memo reads i(),
              // selectedIndex(), and theme() exactly once each, halving the
              // per-keystroke hex-parsing cost of selectedForeground.
              const styles = createMemo(() => {
                const sel = i() === selectedIndex()
                return {
                  bg: sel ? theme().primary : undefined,
                  fg: sel ? selectedForeground(theme()) : theme().text,
                  fgMuted: sel ? selectedForeground(theme()) : theme().textMuted,
                }
              })

              return (
                <box
                  id={option.value}
                  onMouseUp={() => {
                    if (!option.disabled) {
                      if (option.onSelect) option.onSelect()
                      if (props.onSelect) props.onSelect(option)
                    }
                  }}
                  style={{
                    width: "100%",
                    height: 1,
                    paddingLeft: 1,
                    paddingRight: 1,
                    backgroundColor: styles().bg,
                  }}
                >
                  <box style={{ width: "100%", justifyContent: "space-between", flexDirection: "row" }}>
                    <text>
                      <span style={{ fg: styles().fg }}>
                        {/* Current indicator */}
                        {option.value === props.current ? "● " : "  "}
                        {truncate(option.title, 40)}
                      </span>
                    </text>

                    {/* Right-aligned group: the direct keybind (if any) as a
                        dim bold badge, then the category. Showing the keybind
                        here teaches the shortcut exactly where users look for
                        features. */}
                    <box style={{ flexDirection: "row", gap: 1 }}>
                      <Show when={option.keybind}>
                        <text>
                          <span style={{ fg: styles().fgMuted, bold: true }}>
                            {option.keybind}
                          </span>
                        </text>
                      </Show>
                      <Show when={option.category}>
                        <text>
                          <span style={{ fg: styles().fgMuted }}>
                            {option.category}
                          </span>
                        </text>
                      </Show>
                    </box>
                  </box>
                </box>
              )
            }}
          </For>
        </scrollbox>
      </Show>

      {/* Footer / Keybinds */}
      {/* minHeight pins the footer to one row so the chrome costs the same
          whether or not this caller renders hints — otherwise the list's
          viewport changed by a row depending on the caller and clipped. */}
      <box style={{ width: "100%", marginTop: 1, gap: 2, flexDirection: "row", minHeight: 1 }}>
        <For each={props.keybinds || []}>
          {(kb) => (
            <text>
              <span style={{ bold: true }}>{kb.label}</span> {kb.key}
            </text>
          )}
        </For>
        {/* Selected item footer info if available */}
        <Show when={filteredOptions()[selectedIndex()]?.footer}>
           <text>
             <span style={{ fg: theme().textMuted }}>
               {filteredOptions()[selectedIndex()]!.footer}
             </span>
           </text>
        </Show>
      </box>
    </Dialog>
  )
}
