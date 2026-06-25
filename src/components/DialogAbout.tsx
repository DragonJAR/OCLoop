import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { useTheme } from "../context/ThemeContext"
import { VERSION } from "../lib/cli-args"
import { t } from "../lib/i18n"

/**
 * Props for the DialogAbout component
 */
export interface DialogAboutProps {
  onClose: () => void
}

// Single-sourced links — data, not translatable copy, so they live here once
// instead of being duplicated across the en/es i18n tables.
const LINK_AUTHOR = "https://github.com/d3vr"
const LINK_DRAGONJAR = "https://www.dragonjar.org"
const LINK_SERVICES = "https://www.dragonjar.org/servicios-de-seguridad-informatica"
const LINK_REPO = "https://github.com/DragonJAR/OCLoop"

/**
 * "About" overlay, opened from the command palette (Ctrl+P → About).
 *
 * A static credits screen: what OCLoop is, who created it, who maintains this
 * fork, and where to find DragonJAR's security services. All prose is i18n
 * (en/es); proper nouns, the version and URLs are single-sourced as data.
 *
 * Any key closes it (in addition to the Dialog backdrop/Escape), mirroring
 * DialogHelp so there's no "how do I dismiss this" confusion.
 */
export function DialogAbout(props: DialogAboutProps) {
  const { theme } = useTheme()

  useKeyboard((key) => {
    props.onClose()
    key.preventDefault()
  })

  // label + URL pair, rendered with the URL highlighted so terminals that
  // linkify (or the user's eye) can find it. Emitted as direct <text> siblings
  // (Fragment, no wrapping <box>): an auto-sized box defaults to flexShrink:1
  // in OpenTUI, so under the fixed-height Dialog it gets squeezed and the two
  // lines collapse onto one row (the URL then overwrites the label). Direct
  // <text> children keep their measured height (flexShrink:0) — same pattern
  // as the tagline/runtime above.
  const Credit = (p: { label: string; url: string; last?: boolean }) => (
    <>
      <text>
        <span style={{ fg: theme().text }}>{p.label}</span>
      </text>
      {/* 1-row gap after each credit, except the last — a trailing blank there
          just unbalances the vertical centering against the top padding. */}
      <text style={{ marginBottom: p.last ? 0 : 1 }}>
        <span style={{ fg: theme().primary }}>{`  ${p.url}`}</span>
      </text>
    </>
  )

  // ponytail: height sized snug to the (taller) es copy — 19 content rows + 1
  // padding row top & bottom = 21 — so the box hugs the text instead of leaving
  // a void below it. A longer translation or a terminal shorter than the dialog
  // clips the last credit; wrap the credits in a <scrollbox> like DialogHelp if
  // that ever matters.
  return (
    <Dialog onClose={props.onClose} width={72} height={21}>
      <box style={{ flexDirection: "column" }}>
        {/* Header: title + version, dismiss hint. flexShrink:0 so that if the
            content ever overflows, Yoga clips the bottom credit rather than
            squeezing this row away and hiding the title. */}
        <box style={{ width: "100%", justifyContent: "space-between", marginBottom: 1, flexDirection: "row", flexShrink: 0 }}>
          <text>
            <span style={{ fg: theme().accent, bold: true }}>{t("aboutTitle")}</span>
            <span style={{ fg: theme().textMuted }}>{`  v${VERSION}`}</span>
          </text>
          <text>
            <span style={{ fg: theme().textMuted }}>{t("helpDismissHint")}</span>
          </text>
        </box>

        {/* Tagline + runtime */}
        <text style={{ marginBottom: 0 }}>
          <span style={{ fg: theme().text }}>{t("aboutTagline")}</span>
        </text>
        <text style={{ marginBottom: 1 }}>
          <span style={{ fg: theme().textMuted }}>{t("aboutRuntime")}</span>
        </text>

        <Credit label={t("aboutRepo")} url={LINK_REPO} />
        <Credit label={t("aboutCreatedBy")} url={LINK_AUTHOR} />
        <Credit label={t("aboutMaintainedBy")} url={LINK_DRAGONJAR} />
        <Credit label={t("aboutServices")} url={LINK_SERVICES} last />
      </box>
    </Dialog>
  )
}
