import type { ContentNode, PaperId } from '../../core/types';
import type { PaperContentTheme } from './PaperContentFrame';

interface Props {
  nodes: ContentNode[];
  onOpen: (paperId: PaperId) => void;
  theme: PaperContentTheme;
}

export function PaperContentNodes({ nodes, onOpen, theme }: Props) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {nodes.map((node, i) => (
        <Node key={i} node={node} onOpen={onOpen} theme={theme} />
      ))}
    </div>
  );
}

interface NodeProps {
  node: ContentNode;
  onOpen: (paperId: PaperId) => void;
  theme: PaperContentTheme;
}

function Node({ node, onOpen, theme }: NodeProps) {
  switch (node.type) {
    case 'text':
      return <span style={{ color: theme.text }}>{node.value}</span>;

    case 'paragraph':
      return (
        <p style={{ margin: 0, color: theme.text, lineHeight: 1.65, fontSize: '0.85rem' }}>
          {node.children.map((c, i) => (
            <Node key={i} node={c} onOpen={onOpen} theme={theme} />
          ))}
        </p>
      );

    case 'bold':
      return (
        <strong>
          {node.children.map((c, i) => (
            <Node key={i} node={c} onOpen={onOpen} theme={theme} />
          ))}
        </strong>
      );

    case 'paper-link':
      return (
        <a
          role="button"
          tabIndex={0}
          onClick={() => onOpen(node.paperId)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(node.paperId)}
          style={{
            color: theme.linkText,
            background: theme.linkBackground,
            border: `1px solid ${theme.linkBorder}`,
            borderRadius: 4,
            padding: '1px 5px',
            cursor: 'pointer',
            fontSize: 'inherit',
            textDecoration: 'none',
            display: 'inline',
          }}
        >
          {node.label}
        </a>
      );

    case 'card':
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(node.paperId)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(node.paperId)}
          style={{
            border: `1px solid ${theme.linkBorder}`,
            borderRadius: 8,
            padding: '10px 12px',
            background: theme.linkBackground,
            cursor: 'pointer',
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.linkText }}>
            {node.title}
          </p>
          <p style={{ margin: 0, fontSize: '0.78rem', color: theme.text, lineHeight: 1.55 }}>
            {node.description}
          </p>
        </div>
      );

    case 'section':
      return (
        <section>
          {node.title && (
            <h2 style={{ margin: '0 0 8px', fontSize: '1rem', color: theme.text }}>{node.title}</h2>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {node.children.map((c, i) => (
              <Node key={i} node={c} onOpen={onOpen} theme={theme} />
            ))}
          </div>
        </section>
      );

    case 'list':
      return (
        <ul style={{ margin: 0, paddingLeft: 16, color: theme.text, lineHeight: 1.8, fontSize: '0.85rem' }}>
          {node.items.map((item, i) => (
            <li key={i}>
              {item.map((c, j) => (
                <Node key={j} node={c} onOpen={onOpen} theme={theme} />
              ))}
            </li>
          ))}
        </ul>
      );

    case 'table':
      return (
        <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: theme.surfaceRaised }}>
              {node.headers.map((h, i) => (
                <th key={i} style={{ padding: '6px 8px', textAlign: 'left', color: theme.text }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? theme.surfaceAlt : 'transparent' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '5px 8px', color: theme.mutedText }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'callout':
      return (
        <div style={{
          borderLeft: `3px solid ${theme.linkBorder}`,
          background: theme.surfaceAlt,
          borderRadius: 4,
          padding: '8px 12px',
          fontSize: '0.8rem',
          color: theme.mutedText,
          lineHeight: 1.6,
        }}>
          {node.children.map((c, i) => (
            <Node key={i} node={c} onOpen={onOpen} theme={theme} />
          ))}
        </div>
      );
  }
}
