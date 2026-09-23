"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import AgentAvatar from "./AgentAvatar";
import { getAgent } from "./agents";
import type { Briefing } from "./briefing";
import styles from "./TeamBriefing.module.css";

const KIND_LABEL: Record<Briefing["kind"], string> = { update: "Update", question: "Question", unavailable: "Coming later" };

/** The dashboard's team: each member says one thing and offers one next step. */
export default function TeamBriefing({ briefing, onCreateBook }: { briefing: Briefing[]; onCreateBook?: () => void }) {
  return (
    <section className={styles.team} aria-labelledby="team-briefing-heading">
      <h2 id="team-briefing-heading" className={styles.heading}>Your team</h2>
      <ul className={styles.list}>
        {briefing.map((item) => {
          const agent = getAgent(item.agent);
          return (
            <li key={item.agent} className={styles.member} data-agent={item.agent} data-kind={item.kind}>
              <div className={styles.identity}>
                <AgentAvatar agent={item.agent} size={52} />
                <p><strong>{agent.name}</strong><span>{agent.role}</span></p>
              </div>
              <div className={styles.bubble}>
                <span className={styles.kind}>{KIND_LABEL[item.kind]}</span>
                <p>{item.message}</p>
                {item.action?.kind === "link" && <Link href={item.action.href} className={styles.action}>{item.action.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
                {item.action?.kind === "create" && onCreateBook && <button type="button" onClick={onCreateBook} className={styles.action}>{item.action.label}<ArrowUpRight size={14} aria-hidden="true" /></button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
