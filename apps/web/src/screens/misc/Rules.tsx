import type { ReactNode } from 'react';
import { BackLink, ErrorState, LargeTitle, List, ListRow, Loading, Screen, SectionHeader } from '../../components/ui';
import { useClubSettings } from '../../lib/queries';
import s from './misc.module.css';

type Block = { kind: 'section'; title: string; items: string[] } | { kind: 'text'; text: string };

/**
 * The rules are plain text edited by admins: "# Title" starts a section,
 * "- item" is a rule, anything else is a paragraph.
 */
function parseRules(text: string): Block[] {
  const blocks: Block[] = [];
  let section: Extract<Block, { kind: 'section' }> | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      section = { kind: 'section', title: line.replace(/^#+\s*/, ''), items: [] };
      blocks.push(section);
    } else if (/^[-*•]\s+/.test(line)) {
      const item = line.replace(/^[-*•]\s+/, '');
      if (!section) {
        section = { kind: 'section', title: '', items: [] };
        blocks.push(section);
      }
      section.items.push(item);
    } else {
      section = null;
      blocks.push({ kind: 'text', text: line });
    }
  }
  return blocks;
}

export default function Rules() {
  const { data, isPending, error, refetch } = useClubSettings();

  let content: ReactNode;
  if (isPending) content = <Loading />;
  else if (error) content = <ErrorState error={error} onRetry={() => void refetch()} />;
  else {
    content = (
      <div className={s.rules}>
        {parseRules(data.clubRules).map((block, index) =>
          block.kind === 'text' ? (
            <p key={index} className={s.paragraph}>
              {block.text}
            </p>
          ) : (
            <section key={index}>
              {block.title && <SectionHeader>{block.title}</SectionHeader>}
              <List>
                {block.items.map((item, i) => (
                  <ListRow key={i} title={<span className={s.bullet}>{item}</span>} />
                ))}
              </List>
            </section>
          ),
        )}
      </div>
    );
  }

  return (
    <Screen>
      <BackLink to="/home">Home</BackLink>
      <LargeTitle>Club rules</LargeTitle>
      {content}
    </Screen>
  );
}
