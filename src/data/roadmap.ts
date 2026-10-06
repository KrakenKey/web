// Source for /roadmap. Review monthly alongside the release-notes post:
// move shipped items to `shipped`, bump `updated`, keep each column short.

export interface RoadmapItem {
  title: string;
  description: string;
  link?: { href: string; label: string };
}

export interface RoadmapColumn {
  id: 'now' | 'next' | 'later';
  title: string;
  summary: string;
  items: RoadmapItem[];
}

export const updated = '2026-10-06';

export const columns: RoadmapColumn[] = [
  {
    id: 'now',
    title: 'Now',
    summary: 'In progress or in review.',
    items: [
      {
        title: 'Renewal guides for 100-day certificates',
        description:
          'Certificate lifetimes drop to 100 days on 2027-03-15. Guides for nginx, Traefik, HAProxy, IIS and Kubernetes: issue with the CLI, renew on a daily timer, write the chain where the server expects it, and reload.',
        link: { href: 'https://github.com/KrakenKey/web/issues/86', label: 'web#86' },
      },
      {
        title: 'Probe as a system service',
        description:
          'Install the probe from the apt and dnf repositories and run it as a systemd service that checks your endpoints on a schedule.',
        link: { href: 'https://github.com/KrakenKey/cli/issues/46', label: 'cli#46' },
      },
      {
        title: 'Kubernetes integration',
        description: 'Request and renew certificates from inside a cluster, with the private key staying in the cluster.',
        link: { href: 'https://github.com/KrakenKey/app/issues/124', label: 'app#124' },
      },
    ],
  },
  {
    id: 'next',
    title: 'Next',
    summary: 'Planned after the current work ships.',
    items: [
      {
        title: 'Merkle Tree Certificates',
        description:
          'Support for Let\'s Encrypt\'s post-quantum certificate format ahead of its 2027 production rollout.',
        link: { href: 'https://github.com/KrakenKey/app/issues/125', label: 'app#125' },
      },
      {
        title: 'Terraform provider',
        description:
          'Manage certificates, domains and alert channels as Terraform resources, published on the Terraform Registry.',
      },
      {
        title: 'Domain verification that rides out DNS hiccups',
        description:
          'The daily recheck retries a failed lookup and allows a grace period, with an alert, before a domain loses its verified status.',
      },
    ],
  },
  {
    id: 'later',
    title: 'Later',
    summary: 'On our list, not yet scheduled.',
    items: [
      {
        title: 'Certificates declared in your repository',
        description:
          'List the certificates you need in a file in your GitHub repository. KrakenKey checks pull requests, issues and renews them, and delivers them to repository secrets or a webhook.',
      },
      {
        title: 'API key expiry alerts',
        description: 'A heads-up before an API key expires, through the same email, Slack, Teams and webhook channels as certificate alerts.',
      },
    ],
  },
];

export const shipped: RoadmapItem[] = [
  {
    title: 'Signed apt and dnf repositories',
    description:
      'Install the CLI from packages.krakenkey.io with apt or dnf and keep it current with normal upgrades. Signed metadata and packages, with key changes delivered by a keyring package. The probe joins with its next release.',
    link: { href: '/docs/cli/', label: 'Install docs' },
  },
  {
    title: 'GitHub Action without a stored key',
    description:
      'The certificate action authenticates with GitHub OIDC: trust a repository once, and its workflows get a 15-minute key with that trust policy\'s scopes and limits.',
    link: { href: 'https://github.com/KrakenKey/cert-action/releases/tag/v1.4.0', label: 'cert-action v1.4.0' },
  },
  {
    title: 'Portfolio TLS report',
    description:
      'Check a list of hosts at once for expiry, issuer, hostname coverage and chain problems, sorted by urgency, with a CSV export and a read-only share link.',
    link: { href: 'https://github.com/KrakenKey/app/issues/123', label: 'app#123' },
  },
  {
    title: 'ACME Renewal Information (ARI)',
    description:
      'KrakenKey checks each certificate\'s CA-suggested renewal window and renews early when the CA asks for a replacement, with an alert when it does.',
    link: { href: 'https://github.com/KrakenKey/app/issues/121', label: 'app#121' },
  },
  {
    title: 'Slack, Teams and webhook alerts',
    description:
      'Send issuance, renewal, expiry and scan-failure alerts to Slack, Microsoft Teams or your own HTTPS endpoint with signed payloads, alongside email.',
    link: { href: 'https://github.com/KrakenKey/app/issues/120', label: 'app#120' },
  },
  {
    title: 'Homebrew and Linux packages for the CLI',
    description:
      'brew install krakenkey/tap/krakenkey on macOS and Linux, with updates through brew upgrade, plus .deb and .rpm packages on every release.',
    link: { href: 'https://github.com/KrakenKey/cli/releases/tag/v0.8.0', label: 'CLI v0.8.0' },
  },
  {
    title: 'Scoped API keys',
    description:
      'Limit a key to what it needs when you create it: read-only, certificate renewal or a custom set of scopes, specific domains or certificates, and the IP addresses it may be used from.',
    link: { href: 'https://github.com/KrakenKey/app/issues/122', label: 'app#122' },
  },
  {
    title: 'GitHub Action renewals',
    description:
      'An if-due input so scheduled workflows renew only when due, and comma-separated SANs split into separate names.',
    link: { href: 'https://github.com/KrakenKey/cert-action/releases/tag/v1.3.0', label: 'cert-action v1.3.0' },
  },
  {
    title: 'Renewals that are safe to schedule',
    description:
      'cert renew --if-due renews only inside your plan\'s renewal window, so a daily cron job or timer no longer reissues every run. renew --wait now saves the renewed certificate, and a missing chain is reported instead of skipped.',
    link: { href: 'https://github.com/KrakenKey/cli/releases/tag/v0.7.0', label: 'CLI v0.7.0' },
  },
  {
    title: 'API key activity and revocation history',
    description:
      'See when and from which IP each key was last used. Revoked keys stay visible for 30 days.',
  },
  {
    title: 'Browser sign-in for the CLI',
    description: 'krakenkey auth login --web approves a CLI session from the dashboard, with no key to copy and paste.',
  },
  {
    title: 'API keys limited to certificate work',
    description:
      'Keys can no longer change account, billing or organization settings, or create more keys. Those need a dashboard session.',
  },
  {
    title: 'DNS delegation preflight',
    description:
      'Missing or wrong _acme-challenge CNAME records fail fast with the exact record to add.',
    link: { href: '/blog/september-2026-release-notes/', label: 'September release notes' },
  },
  {
    title: 'Caddy integration guide',
    description: 'Wildcard certificates for Caddy without giving it DNS provider credentials.',
    link: { href: '/docs/integrations/caddy/', label: 'Guide' },
  },
];
