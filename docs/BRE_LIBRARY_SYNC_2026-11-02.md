# BRE dependency synchronization

2026-11-02. Root MaiaCCfe00596/MaiaRegex8a1dcbf gitlinks were recorded after
completed git_pull and before npm test. All10 assembler cases passed, including
the intentional invalid-input case. No assembler, WAT grammar/generated parser,
ordered matcher, version or npm change. The old lexer runtime sources remain
byte-identical; no new BRE execution is claimed by assembler regressions.

Development-only Regex tools/maiacpp is intentionally skipped by update=none;
its exact historical lock/published pins are verified in principal Regex. Normal
consumers must not recursively move those toolchain descendants. All initialized
consumer dependencies match the reviewed published gitlinks.
