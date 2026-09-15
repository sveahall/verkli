import AgentAvatar from "./AgentAvatar";
import { getAgent, type AgentId } from "./agents";
import styles from "./AgentTeam.module.css";

export default function AgentCompanion({ agent: id }: { agent: AgentId }) {
  const agent = getAgent(id);
  return (
    <div className={styles.companion} data-agent={id}>
      <AgentAvatar agent={id} size={68} />
      <div>
        <p className={styles.companionName}>{agent.name} <span> / {agent.role}</span></p>
        <p className={styles.companionNote}>{agent.note}</p>
      </div>
    </div>
  );
}
