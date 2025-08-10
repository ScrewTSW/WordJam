"use client";
import Image from "next/image";
import React, { useRef, useState } from "react";

type ListItemProps = {
  label: string;
  icons?: Array<string>;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
};

const ListItem: React.FC<ListItemProps> = ({ label, icons = [], tooltip, onClick, className }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setShowTooltip(true), 2000);
  };
  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowTooltip(false);
  };

  return (
    <li
      className={
        [
          "relative bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 text-xs whitespace-nowrap flex items-center gap-1 cursor-pointer",
          className
        ].filter(Boolean).join(" ")
      }
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Display up to 3 icons (emoji or image URLs) */}
      {icons.slice(0, 3).map((icon, idx) =>
        icon.startsWith("/") ? (
          <Image
            key={idx}
            src={icon}
            alt="icon"
            width={16}
            height={16}
            className="inline-block"
          />
        ) : (
          <span key={idx} className="inline-block text-base">
            {icon}
          </span>
        )
      )}
      <span>{label}</span>
      {tooltip && showTooltip && (
        <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 bg-black text-white text-xs rounded px-2 py-1 z-10 whitespace-normal min-w-[100px] max-w-[200px] shadow-lg">
          {tooltip}
        </span>
      )}
    </li>
  );
};

export default ListItem;
