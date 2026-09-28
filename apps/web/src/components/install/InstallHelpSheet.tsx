import { Check, Download, Ellipsis, EllipsisVertical, ExternalLink, Share, SquarePlus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { InstallPlatform } from '../../lib/install';
import { List, ListRow, SectionFooter, Sheet } from '../ui';

interface Guide {
  title: string;
  steps: { icon: ReactNode; title: string; subtitle?: string }[];
  footer: string;
}

const GUIDES: Record<InstallPlatform, Guide> = {
  ios: {
    title: 'Install on iPhone',
    steps: [
      { icon: <Share />, title: '1. Tap Share', subtitle: 'The square with an arrow, in the Safari toolbar' },
      { icon: <SquarePlus />, title: '2. Add to Home Screen', subtitle: "Scroll the menu if you don't see it" },
      { icon: <Check />, title: '3. Tap Add', subtitle: 'Identity appears on your home screen' },
    ],
    footer: 'The app then opens full screen, like a native app.',
  },
  android: {
    title: 'Install on Android',
    steps: [
      { icon: <EllipsisVertical />, title: '1. Open the browser menu', subtitle: 'The ⋮ button, top right' },
      { icon: <Download />, title: '2. Install app', subtitle: 'Or "Add to Home screen", depending on the browser' },
    ],
    footer: 'The app then opens full screen from your home screen.',
  },
  'mac-safari': {
    title: 'Add to your Dock',
    steps: [
      { icon: <Share />, title: '1. In Safari, open the File menu', subtitle: 'Or the Share button of the toolbar' },
      { icon: <SquarePlus />, title: '2. Add to Dock' },
    ],
    footer: 'Identity then opens in its own window.',
  },
  'in-app': {
    title: 'Open in your browser',
    steps: [
      { icon: <Ellipsis />, title: '1. Tap ⋯ in the corner', subtitle: 'This page is open inside another app' },
      { icon: <ExternalLink />, title: '2. Open in browser', subtitle: 'Safari on iPhone, Chrome on Android' },
      { icon: <Download />, title: '3. Install from there' },
    ],
    footer: 'Apps like Instagram or Facebook cannot install web apps themselves.',
  },
  other: {
    title: 'Install the app',
    steps: [
      { icon: <Download />, title: 'Look for "Install" in your browser', subtitle: 'In the address bar or the browser menu' },
    ],
    footer: 'Chrome, Edge and Safari can install Identity as an app.',
  },
};

/** Step-by-step install instructions for browsers without an install dialog. */
export function InstallHelpSheet({
  open,
  onClose,
  platform,
}: {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
}) {
  const guide = GUIDES[platform];
  return (
    <Sheet open={open} onClose={onClose} title={guide.title}>
      <List>
        {guide.steps.map((step) => (
          <ListRow key={step.title} icon={step.icon} title={step.title} subtitle={step.subtitle} />
        ))}
      </List>
      <SectionFooter>{guide.footer}</SectionFooter>
    </Sheet>
  );
}
