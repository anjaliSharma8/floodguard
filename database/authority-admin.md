# Authority Admin setup

The backend applies schema migrations 2 and 3 automatically on startup. If an existing SQLite database is present, the application writes a consistent `VACUUM INTO` backup beside it before applying a pending migration. Keep the backup until the upgraded database has been verified.

Create the initial authority and first Authority Admin once, using the existing database:

```powershell
$env:AUTHORITY_NAME = "Pune Disaster Management Authority"
$env:AUTHORITY_TYPE = "GOVERNMENT"
$env:AUTHORITY_REGION = "Pune & PCMC, Maharashtra"
$env:ADMIN_FULL_NAME = "Authority Admin"
$env:ADMIN_EMAIL = "admin@example.gov.in"
$securePassword = Read-Host "Initial admin password" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
npm run setup:authority
Remove-Item Env:ADMIN_PASSWORD
```

`ADMIN_PASSWORD` must contain at least 12 characters. The setup command refuses to run if an authority or Authority Admin already exists. It attaches previously active Expert accounts to the first authority without granting permissions; an admin must explicitly assign permissions in the dashboard. Unassigned pending expert applications are assigned to that authority for review. Existing unassigned roads and shelters are assigned to the first authority. Expert road, shelter, and report-review mutations are restricted to resources owned by their active authority membership.

Required setup values are `AUTHORITY_NAME`, `AUTHORITY_TYPE`, `AUTHORITY_REGION`, `ADMIN_FULL_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. The command also uses the existing `DATABASE_URL` setting (defaults to `data/sanketsetu.db`). Avoid storing `ADMIN_PASSWORD` in shell history or a committed environment file.

For production, configure `SESSION_SECRET` to a cryptographically random value of at least 16 characters before starting the server. An ephemeral development-only secret is used when this value is absent outside production; sessions will not survive process restarts in that mode.
