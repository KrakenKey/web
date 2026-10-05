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

export const updated = '2026-10-05';

export const columns: RoadmapColumn[] = [
  {
    id: 'now',
    title: 'Now',
    summary: 'In progress or in review.',
    items: [
      {
        title: 'Slack, Teams and webhook alerts',
        description:
          'Send expiry warnings, renewal results and scan failures to chat or your own endpoint, not just email.',
        link: { href: 'https://github.com/KrakenKey/app/issues/120', label: 'app#120' },
      },
      {
        title: 'ACME Renewal Information (ARI)',
        description:
          'Let the CA tell us when to renew. This matters more as lifetimes drop to 100 days and when a CA has to replace certificates early.',
        link: { href: 'https://github.com/KrakenKey/app/issues/121', label: 'app#121' },
      },
      {
        title: 'Portfolio TLS report',
        description:
          'Check a list of domains at once and get a shareable report of expiry exposure, coverage and chain problems, sorted by urgency.',
        link: { href: 'https://github.com/KrakenKey/app/issues/123', label: 'app#123' },
      },
      {
        title: 'GitHub Action without a stored key',
        description:
          'Authenticate the certificate action with GitHub OIDC, so workflows hold no long-lived KrakenKey secret.',
        link: { href: 'https://github.com/KrakenKey/cert-action/issues/32', label: 'cert-action#32' },
      },
      {
        title: 'Homebrew install',
        description: 'brew install for the CLI on macOS and Linux, with updates through brew upgrade.',
        link: { href: 'https://github.com/KrakenKey/cli/issues/42', label: 'cli#42' },
      },
      {
        title: 'apt and dnf packages',
        description:
          'Signed package repositories we host ourselves for the CLI and the probe, with the probe installed as a systemd service.',
        link: { href: 'https://github.com/KrakenKey/cli/issues/46', label: 'cli#46' },
      },
    ],
  },
  {
    id: 'next',
    title: 'Next',
    summary: 'Planned after the current work ships.',
    items: [
      {
        title: 'Kubernetes integration',
        description: 'Request and renew certificates from inside a cluster, with the private key staying in the cluster.',
        link: { href: 'https://github.com/KrakenKey/app/issues/124', label: 'app#124' },
      },
      {
        title: 'Merkle Tree Certificates',
        description:
          'Support for Let\'s Encrypt\'s post-quantum certificate format ahead of its 2027 production rollout.',
        link: { href: 'https://github.com/KrakenKey/app/issues/125', label: 'app#125' },
      },
    ],
  },
  {
    id: 'later',
    title: 'Later',
    summary: 'On our list, not yet scheduled.',
    items: [],
  },
];

export const shipped: RoadmapItem[] = [
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
