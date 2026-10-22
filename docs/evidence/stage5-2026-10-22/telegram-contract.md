# Telegram contract reference — Stage 5 local only

Checked 2026-10-22 against the primary [Bot API request contract](https://core.telegram.org/bots/api#making-requests),
[sendMessage](https://core.telegram.org/bots/api#sendmessage),
[ResponseParameters](https://core.telegram.org/bots/api#responseparameters) and
[formatting options](https://core.telegram.org/bots/api#formatting-options).
No request to `api.telegram.org` was made. Documentation reading used `core.telegram.org`.

The subset is POST JSON with numeric `chat_id`, plain `text`, and disabled link
previews. No parse mode, paid broadcast, SDK, bot commands, webhook, edit or delete.
Success requires the JSON outcome plus a valid Message identity matching the
destination. The client conservatively limits text to 4096 UTF-16 units and
rejects malformed Unicode. JSON response streams are bounded at 32 KiB; the
timeout includes response body consumption. Redirects are refused.

Only a validated 429 refusal with bounded integer `parameters.retry_after`
(1–3600 seconds) permits retry. The three-attempt local journal cap is our
conservative choice, not a Telegram guarantee. Valid 4xx refusals are terminal;
migration hints never change destination. Malformed success, disconnect,
timeout and 5xx remain uncertain and cannot cause an automatic resend.

Orbit public discovery was consulted before implementation. Selected resource:
`urn:orbit:endpoint:v1:aGr5TvrQ7yYMVmFIZbpJRsvhe167R8oG:telegram:post-sendmessage`.
Its integration brief reported partial fit because error examples were absent;
some discovered URLs duplicated the bot prefix and old optional fields were
present. The primary Telegram documentation above determines the implemented
subset; discovery output does not override it.

Postman CLI 1.75.0 has no signed-in account in this session. Owner workspace/mock
search was skipped; the local stand-in is derived from the primary contract.
It has no pass-through path and rejects unknown operations with 501. Failure
modes are explicitly synthetic and do not establish real Telegram behavior.
No shared workspace binding, push or mock deployment is needed.
