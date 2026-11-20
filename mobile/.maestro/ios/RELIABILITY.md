# iOS smoke reliability trial

Record at least **five non-injected runs over at least one week**, including a cold build and cached runs. Record the intentional login/navigation negative controls too, but exclude them from the non-injected count and flake-rate denominator. A failed run counts as flaky only after investigation; do not assume a retry passing makes it flaky. Use `product`, `flaky`, `infrastructure`, or `negative-control` for the failure class; use a dash for a passing run. Keep links to artifacts and the diagnostic finding with the run evidence. No native result is attested by this empty template.

| Run URL | Date (UTC) | SHA | Trigger | Cache state | Build seconds | Total seconds | Result | Failure class (`product` / `flaky` / `infrastructure` / `negative-control`) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
