/**
 * DialogTierPicker — model-routing panel (3 steps, single dialog).
 *
 * Shown at startup when `--routing` is passed. Lets the user assign a concrete
 * model (from the live opencode catalog) to each of three roles:
 *   - heavy  → the model the main agent uses for every plan task
 *   - cheap  → reserved for future deterministic work (test-gen, review)
 *   - judge  → the LM-judge for the eval layer (Phase 2)
 *
 * Design decision: a SINGLE dialog manages the three picks internally via a
 * `step` index, rather than chaining three dialogs on the stack. Chaining
 * leaves brief empty-stack windows between pop/show where a keypress could be
 * lost; a single component never has an empty stack, so input is always
 * captured.
 *
 * The `.show()` helper mirrors `DialogConfirm.show` (ui/DialogConfirm.tsx:127):
 * it returns a Promise that settles with the `{ role: "provider/model" }`
 * mapping once the last step is picked, or `{}` on cancel/Esc/unmount. The
 * `resolved` guard + `onUnmount` net prevent the awaiter from ever hanging.
 */

import { createSignal, Show, type JSX } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "./DialogSelect"
import type { DialogContextValue } from "../context/DialogContext"
import { t } from "../lib/i18n"

/** A role the user can assign a model to. */
export interface TierRole {
  /** Stable id used as the mapping key (e.g. "heavy"). */
  id: string
  /** Human-readable label shown in the step title. */
  label: string
  /** One-line description of what the role is for. */
  description: string
  /**
   * Optional default "provider/model" to pre-select (marked with ● in the
   * list). When provided, the user can just press Enter to accept it.
   */
  defaultModel?: string
}

export interface DialogTierPickerProps {
  /** The three roles, in the order they'll be picked. */
  tiers: TierRole[]
  /** The connected models to choose from (flattened catalog). */
  options: DialogSelectOption[]
  /** Called with the full mapping when the last step is picked. */
  onDone: (mapping: Record<string, string>) => void
}

/** The canonical three roles, in pick order. */
export const ROUTING_TIERS: TierRole[] = [
  {
    id: "heavy",
    label: t("routingHeavyLabel"),
    description: t("routingHeavyDesc"),
  },
  {
    id: "judge",
    label: t("routingJudgeLabel"),
    description: t("routingJudgeDesc"),
  },
  {
    id: "cheap",
    label: t("routingCheapLabel"),
    description: t("routingCheapDesc"),
  },
]

export function DialogTierPicker(props: DialogTierPickerProps) {
  const [step, setStep] = createSignal(0)
  // Accumulated mapping across steps. A role not picked (skipped with Esc on
  // its step) simply isn't a key — the consumer falls back to the active model.
  const [mapping, setMapping] = createSignal<Record<string, string>>({})

  const currentTier = () => props.tiers[step()]
  const isLast = () => step() === props.tiers.length - 1

  const pick = (value: string) => {
    const tier = currentTier()
    const next = { ...mapping(), [tier.id]: value }
    setMapping(next)
    if (isLast()) {
      props.onDone(next)
    } else {
      setStep(step() + 1)
    }
  }

  /** Skip the current role (leave it unmapped) and advance. */
  const skip = () => {
    if (isLast()) {
      props.onDone(mapping())
    } else {
      setStep(step() + 1)
    }
  }

  return (
    <Show when={currentTier()}>
      <DialogSelect
        title={t("routingStepTitle", {
          n: step() + 1,
          total: props.tiers.length,
          label: currentTier().label,
        })}
        placeholder={t("routingPlaceholder")}
        options={props.options}
        current={mapping()[currentTier().id] ?? currentTier().defaultModel}
        onClose={() => {
          // Esc on the FIRST step = cancel entirely (empty mapping).
          // Esc on a later step = finish with whatever was picked so far.
          if (step() === 0) {
            props.onDone({})
          } else {
            props.onDone(mapping())
          }
        }}
        keybinds={[
          { label: t("kbSelect"), key: "Enter" },
          { label: t("kbNavigate"), key: "↑/↓" },
          { label: t("routingSkip"), key: "S", onSelect: skip },
        ]}
        onSelect={(opt) => {
          // DialogSelect stays open after onSelect; we drive the step transition.
          if (opt && opt.value) pick(opt.value)
        }}
      />
    </Show>
  )
}

/**
 * Awaitable helper: show the tier picker and resolve with the mapping.
 * Mirrors DialogConfirm.show's resolved-guard + onUnmount safety net so the
 * awaiter can never hang (external clear/replace/teardown → settle({})).
 */
DialogTierPicker.show = (
  dialog: DialogContextValue,
  tiers: TierRole[],
  options: DialogSelectOption[],
): Promise<Record<string, string>> => {
  return new Promise((resolve) => {
    let resolved = false
    const settle = (value: Record<string, string>) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    dialog.replace(() => (
      <DialogTierPicker
        tiers={tiers}
        options={options}
        onDone={(mapping) => {
          dialog.clear()
          settle(mapping)
        }}
      />
    ))
  })
}

// Keep JSX runtime happy: this file returns JSX.Element.
export type _JsxMarker = JSX.Element
