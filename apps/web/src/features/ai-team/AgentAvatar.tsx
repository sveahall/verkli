import Image from "next/image";
import { type AgentId } from "./agents";
import styles from "./AgentTeam.module.css";

/** Decorative when accompanied by the agent's visible name. */
export default function AgentAvatar({ agent, portrait = false, size = 48 }: {
  agent: AgentId;
  portrait?: boolean;
  size?: number;
}) {
  return (
    <span
      className={portrait ? styles.portrait : styles.avatar}
      data-agent={agent}
      style={portrait ? undefined : { width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={`/ai-team/${agent}.webp`}
        alt=""
        width={720}
        height={900}
        sizes={portrait ? "(max-width: 640px) 220px, (max-width: 1000px) 200px, 280px" : `${size * 2}px`}
        className={styles.artwork}
      />
    </span>
  );
}
