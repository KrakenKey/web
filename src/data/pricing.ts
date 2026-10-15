// Source for /pricing and the pricing summary on the home page.
// Numbers follow the app's PLAN_LIMITS and PLAN_LIST_PRICES_CENTS
// (app/shared/src/constants/). Change them together.

export const APP_URL = 'https://app.krakenkey.io';
export const CONTACT_URL = 'mailto:support@krakenkey.io?subject=KrakenKey%20Enterprise';

export type PlanId = 'free' | 'pro' | 'business';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** List price in US dollars; null for the free plan. */
  monthly: number | null;
  yearly: number | null;
  cta: string;
  highlighted?: boolean;
  /** Short list for the plan cards. */
  highlights: string[];
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Starter',
    tagline: 'For small projects',
    monthly: null,
    yearly: null,
    cta: 'Get started free',
    highlights: [
      '3 domains, 10 active certificates',
      'Auto-renewal 10 days before expiry',
      '3 monitored endpoints, 1 on hosted probes',
      'Expiry alerts by email',
      'CLI, API, Terraform provider and GitHub Action',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For production workloads',
    monthly: 29,
    yearly: 290,
    cta: 'Upgrade to Pro',
    highlighted: true,
    highlights: [
      '15 domains, 150 active certificates',
      'Auto-renewal 30 days before expiry',
      '50 monitored endpoints, 25 on hosted probes',
      'Hosted scans every 30 minutes',
      'Organizations with up to 3 members',
      '5 connectors, 5 alert channels',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For teams and many services',
    monthly: 149,
    yearly: 1490,
    cta: 'Upgrade to Business',
    highlights: [
      '100 domains, 1,000 active certificates',
      'Auto-renewal 30 days before expiry',
      '300 monitored endpoints, 150 on hosted probes',
      'Hosted scans every 5 minutes',
      'Organizations with unlimited members',
      '50 connectors, 25 alert channels',
    ],
  },
];

export function formatPrice(dollars: number): string {
  return `$${dollars.toLocaleString('en-US')}`;
}

export interface ComparisonRow {
  label: string;
  /** Values for Starter, Pro and Business, in that order. */
  values: [string, string, string];
  note?: string;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

export const COMPARISON: ComparisonGroup[] = [
  {
    title: 'Certificates',
    rows: [
      { label: 'Domains', values: ['3', '15', '100'] },
      { label: 'Active certificates', values: ['10', '150', '1,000'] },
      { label: 'New certificates per month', values: ['5', '100', '1,000'] },
      {
        label: 'Auto-renewal starts',
        values: ['10 days before expiry', '30 days before expiry', '30 days before expiry'],
        note: 'Certificates renewed by a connector start 30 days before expiry on every plan. On Starter, confirm auto-renewal in the dashboard once every six months.',
      },
    ],
  },
  {
    title: 'Monitoring',
    rows: [
      { label: 'Monitored endpoints', values: ['3', '50', '300'] },
      {
        label: 'Endpoints on hosted probes',
        values: ['1', '25', '150'],
        note: 'Hosted probes run in the US East region. The other endpoints are scanned by probes you run yourself.',
      },
      { label: 'Hosted probes scan every', values: ['60 minutes', '30 minutes', '5 minutes'] },
      { label: 'Your own probes scan as often as every', values: ['60 minutes', '15 minutes', '1 minute'] },
      { label: 'Scan history', values: ['7 days', '30 days', '90 days'] },
      { label: 'Hosts per portfolio report', values: ['25', '250', '1,000'] },
    ],
  },
  {
    title: 'Automation and alerts',
    rows: [
      { label: 'API keys', values: ['2', '10', '50'] },
      { label: 'Connectors', values: ['1', '5', '50'] },
      { label: 'Alert channels (Slack, Teams, webhook)', values: ['1', '5', '25'] },
      { label: 'GitHub Actions OIDC trust policies', values: ['2', '10', '50'] },
    ],
  },
  {
    title: 'Teams',
    rows: [
      {
        label: 'Organization members',
        values: ['None', 'Up to 3', 'Unlimited'],
        note: 'Members share domains, certificates and endpoints under the organization\'s plan, with owner, admin, member and viewer roles.',
      },
    ],
  },
];

/** Included on every plan. */
export const EVERY_PLAN: string[] = [
  "Certificates from Let's Encrypt through DNS-01 with a one-time CNAME delegation",
  'Private keys stay with you: KrakenKey only receives the CSR',
  'Expiry alerts by email',
  'Early renewal when the CA asks for it (ACME Renewal Information)',
  'REST API, dashboard and the krakenkey CLI',
  'Terraform provider',
  'GitHub Action for issuing and renewing certificates',
  'Connector, with an Azure deployment template',
  'Open-source probe for endpoints on your own network',
];
