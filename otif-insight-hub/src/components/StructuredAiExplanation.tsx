import type { ReactNode } from "react";

const SECTION_HEADER_RE =
  /^(risk|rules logic|decision logic|key risk signals|recommended actions)\s*:/i;

function isSectionHeader(line: string): boolean {
  return SECTION_HEADER_RE.test(line.trim());
}

function sectionLabel(line: string): string {
  return line.trim().replace(/\s*:\s*$/, "");
}

interface StructuredAiExplanationProps {
  text: string;
}

export function StructuredAiExplanation({ text }: StructuredAiExplanationProps) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let bulletBuf: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuf.length === 0) return;
    nodes.push(
      <ul
        key={`bullets-${key++}`}
        className="ml-0.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90"
      >
        {bulletBuf.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>,
    );
    bulletBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      flushBullets();
      continue;
    }
    if (t.startsWith("- ")) {
      bulletBuf.push(t.slice(2).trim());
      continue;
    }
    flushBullets();

    if (/^risk\s*:/i.test(t)) {
      nodes.push(
        <p key={`line-${key++}`} className="text-sm font-semibold text-foreground">
          {line.trim()}
        </p>,
      );
      continue;
    }

    if (isSectionHeader(t)) {
      nodes.push(
        <p key={`line-${key++}`} className="mt-4 text-sm font-semibold text-foreground first:mt-0">
          {sectionLabel(t)}:
        </p>,
      );
      continue;
    }

    nodes.push(
      <p key={`line-${key++}`} className="text-sm leading-relaxed text-foreground/90">
        {line.trim()}
      </p>,
    );
  }
  flushBullets();

  return <div className="space-y-2">{nodes}</div>;
}
