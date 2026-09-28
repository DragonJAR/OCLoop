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
 * The `.show()` helper returns the chosen mapping, or an empty mapping when
 * its stack entry is removed. Covering the picker with another modal does not
 * cancel the pending result.
 */

import { createSignal, Show } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "./DialogSelect"
import { showDialogResult, type DialogContextValue } from "../context/DialogContext"
import { t } from "../lib/i18n"

/** A role the user can assign a model to. */
export interface TierRole {
  /** Stable id used as the mapping key (e.g. "heavy"). */
  id: string
  /** Human-readable label shown in the step title. */
  label: string
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

/** Canonical roles; translate on access so imports never capture a locale. */
export function getRoutingTiers(): TierRole[] {
  return [
    {
      id: "heavy",
      get label() { return t("routingHeavyLabel") },
    },
    {
      id: "judge",
      get label() { return t("routingJudgeLabel") },
    },
    {
      id: "cheap",
      get label() { return t("routingCheapLabel") },
    },
  ]
}

// Compatibility for the App consumer: the array is stable, its labels are live.
export const ROUTING_TIERS = getRoutingTiers()

export function DialogTierPicker(props: DialogTierPickerProps) {
  const [step, setStep] = createSignal(0)
  // Accumulated mapping across steps. A role not picked (skipped with Tab on
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
    <Show when={currentTier()} keyed>
      {(tier) => (
      <DialogSelect
        title={t("routingStepTitle", {
          n: step() + 1,
          total: props.tiers.length,
          label: tier.label,
        })}
        placeholder={t("routingPlaceholder")}
        options={props.options}
        current={mapping()[tier.id] ?? tier.defaultModel}
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
          { label: t("routingSkip"), key: "Tab", onSelect: skip, bind: "tab" },
        ]}
        onSelect={(opt) => {
          // DialogSelect stays open after onSelect; we drive the step transition.
          if (opt && opt.value) pick(opt.value)
        }}
      />
      )}
    </Show>
  )
}

/**
 * Awaitable helper: show the tier picker and resolve with the mapping.
 * Uses stack-entry lifetime so clear/replace/teardown also settle the result.
 */
DialogTierPicker.show = (
  dialog: DialogContextValue,
  tiers: TierRole[],
  options: DialogSelectOption[],
): Promise<Record<string, string>> => {
  if (tiers.length === 0) return Promise.resolve({})
  return showDialogResult<Record<string, string>>(dialog, (finish) => (
      <DialogTierPicker
        tiers={tiers}
        options={options}
        onDone={finish}
      />
    ), {}, "replace")
}

// (No _JsxMarker export needed: the JSX runtime is retained by the
// <DialogTierPicker .../> component returned above.)
