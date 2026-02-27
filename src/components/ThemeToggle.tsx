import React, { memo } from "react";
import type { Theme } from "../hooks/useTheme";
import styles from "./ThemeToggle.module.css";

interface Props {
  theme: Theme;
  onCycle: () => void;
}

const LABELS: Record<Theme, string> = {
  auto: "跟随系统",
  light: "浅色",
  dark: "深色",
};

function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 1 A6 6 0 0 1 7 13 Z" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="3" fill="currentColor" />
      <line
        x1="7"
        y1="1"
        x2="7"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="7"
        y1="11"
        x2="7"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="1"
        y1="7"
        x2="3"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="11"
        y1="7"
        x2="13"
        y2="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="2.93"
        y1="2.93"
        x2="4.34"
        y2="4.34"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9.66"
        y1="9.66"
        x2="11.07"
        y2="11.07"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="9.66"
        y1="4.34"
        x2="11.07"
        y2="2.93"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="2.93"
        y1="11.07"
        x2="4.34"
        y2="9.66"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M11.5 8.5A5 5 0 1 1 5.5 2.5a3.5 3.5 0 0 0 6 6z"
        fill="currentColor"
      />
    </svg>
  );
}

const ICONS: Record<Theme, () => React.JSX.Element> = {
  auto: AutoIcon,
  light: SunIcon,
  dark: MoonIcon,
};

const ThemeToggle = memo(function ThemeToggle({ theme, onCycle }: Props) {
  const Icon = ICONS[theme];
  return (
    <button
      className={styles.btn}
      onClick={onCycle}
      title={`主题：${LABELS[theme]}（点击切换）`}
      aria-label={`当前主题：${LABELS[theme]}`}
    >
      <Icon />
    </button>
  );
});

export default ThemeToggle;
