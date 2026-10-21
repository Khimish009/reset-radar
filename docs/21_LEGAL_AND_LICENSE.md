# 21 — Licensing, data rights, independence and privacy

This is product-planning guidance, not legal advice. Verify applicable terms and trademark policies before public production use.

## Repository visibility vs license

The repository already contains the MIT [LICENSE](../LICENSE), copyright **2026 Salman**, and `package.json` declares `license: MIT`. This documents the existing repository state, not a new owner licensing decision. Preserve the actual license text and copyright; do not describe the repository license as missing or awaiting selection. Public repository visibility is separate from its license.

The owner still needs to decide whether separate brand reuse terms or additional permissions for third-party source content are needed before release. This documentation correction introduces no separate asset terms or new content permissions. Historical evidence may retain earlier starter statements about a pending license; those are preserved records, not the current license status.

## Brand and graphics

Reset Radar has its own radar/cyan/amber look. The bot avatar and channel avatar are distinct coordinated graphics. Do not use official Anthropic/OpenAI logos as our logo; don't imply product endorsement. Consider separately documenting permitted reuse of logos/brand assets vs the source-code MIT grant.

## Source data and attribution

- The community sources `clauderesets.com` and `codexreset.ai` are independent of Anthropic and OpenAI. Their public API access and source attribution are not unlimited legal licenses to copy all content, illustrations or full articles.
- Cite the original public announcement (when known) and community tracker in each channel alert and event detail; normalize/summarize facts rather than replicate long original copy.
- CodexReset docs request attribution and preserving seed-archive credit to `codex-resets.com` for older imported data. Respect latest terms and explicit requests.
- Stage 0 examines API docs, rate guidance, robots/fair-use and uncertainty; if reuse permission is ambiguous, restrict publishing until clarified.

## Personal data/privacy

- Public Telegram channel subscriber counts may be visible from Telegram, but Reset Radar backend does not need member lists or personal quota information.
- Public website requires no login, forms, advertising IDs or third-party analytics in initial MVP. Explain any future visitor telemetry/consent before implementation.
- Protect bot token, Cloudflare credentials, CI secrets; never request users' personal Claude/Codex tokens, cookies, passwords or private usage metrics.

## Site/Telegram disclaimers

RU: «Reset Radar — независимый проект, не связанный с Anthropic или OpenAI. Данные собраны по публичным сообщениям и могут обновляться с задержкой; сброс на конкретном аккаунте не гарантируется.»

EN: “Reset Radar is an independent project, not affiliated with Anthropic or OpenAI. Data is based on publicly observed announcements and may be delayed or incomplete; individual account limits are not verified.”
