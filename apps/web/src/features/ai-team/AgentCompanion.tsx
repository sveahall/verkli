import { MessageCircle } from "lucide-react";
import AgentAvatar from "./AgentAvatar";
import { getAgent, type AgentId } from "./agents";
import styles from "./AgentTeam.module.css";

export default function AgentCompanion({ agent: id, onTalk, role, note }: { agent: AgentId; onTalk?: () => void; role?: string; note?: string }) {
  const agent = getAgent(id);
  return (
    <div className={styles.companion} data-agent={id}>
      <AgentAvatar agent={id} size={44} />
      <div>
        <p className={styles.companionName}>{agent.name} <span>{role ?? agent.role}</span></p>
        <p className={styles.companionNote}>{note ?? agent.note}</p>
      </div>
      {onTalk && <button type="button" onClick={onTalk} className={styles.talkButton}><MessageCircle size={16} aria-hidden />Talk to {agent.name}</button>}
    </div>
  );
}
