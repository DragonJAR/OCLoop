/**
 * Best-effort ANSI reset emitted on TUI exit. Covers OpenTUI modes (mouse,
 * focus tracking, bracketed paste, synchronized output, pixel/SGR probes) so
 * legacy Windows conhost does not leave `?[?1016…` / `[4;…t` garbage at the
 * prompt after the process exits.
 */
export const TERMINAL_RESTORE_SEQUENCE =
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l" +
  "\x1b[?1004l\x1b[?2004l\x1b[?2026l\x1b[?2027l\x1b[?1016l\x1b[?2031l" +
  "\x1b[0m\x1b[?25h\x1b[?1049l"