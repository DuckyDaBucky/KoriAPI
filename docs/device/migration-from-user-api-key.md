# Migration from `userApiKey`

Legacy flow:
- `POST /v1/device/bootstrap` with `userApiKey`

Preferred flow:
- `POST /v1/device/bootstrap` with `provisioningCode`

Migration guidance:
- Keep legacy bootstrap available only for transitional firmware and local testing.
- Move production provisioning to short-lived single-use codes.
- After the firmware fleet migrates, disable legacy API-key bootstrap in production configuration.
