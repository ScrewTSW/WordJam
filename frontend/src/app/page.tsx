"use client";
import type { FC } from "react";
import React from "react";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import {
  DndContext,
  useDraggable,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

// DraggableBox component for dnd-kit
interface DraggableBoxProps {
  id: string;
  idx: number;
  x: number;
  y: number;
  activeId?: string | null;
  icons?: string[];
  name?: string;
  idStr?: string;
  isOverlay?: boolean;
}

const DraggableBox: FC<DraggableBoxProps & { onContextMenu?: (e: React.MouseEvent) => void }> = ({ id, idx, x, y, activeId, icons, name, idStr, isOverlay, onContextMenu }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style: React.CSSProperties = {
    position: isOverlay ? "fixed" : "absolute",
    left: isOverlay ? undefined : x,
    top: isOverlay ? undefined : y,
    zIndex: 10 + idx,
    minWidth: 80,
    minHeight: 32,
    background: '#e0e7ef',
    borderRadius: 8,
    padding: '4px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    boxShadow: '0 1px 4px #0001',
    cursor: isDragging ? 'grabbing' : 'grab',
    border: '1px solid #bfc8d6',
    opacity: isOverlay ? 0.7 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    pointerEvents: isOverlay ? 'none' : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      id={`draggable-item-${idx}`}
      style={style}
      title={idStr ? `ID: ${idStr}` : undefined}
      {...listeners}
      {...attributes}
      onContextMenu={onContextMenu}
    >
      {Array.isArray(icons) && icons.slice(0, 3).map((icon: string, i: number) =>
        icon ? (
          icon.startsWith("/") ? (
            <img key={i} src={icon} alt="icon" width={16} height={16} style={{ display: 'inline-block' }} />
          ) : (
            <span key={i} style={{ fontSize: 18 }}>{icon}</span>
          )
        ) : null
      )}
      <span>{name || idStr || `Item ${idx + 1}`}</span>
    </div>
  );
};

// Helper to generate unique instance IDs
function makeInstanceId(item: any) {
  return `${item.id || item.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Home() {
  // For right panel context menu
  const [rightPanelContextId, setRightPanelContextId] = useState<string | null>(null);
  const [rightPanelContextPos, setRightPanelContextPos] = useState<{ x: number; y: number } | null>(null);
  // Click outside to close right panel context menu (must be before return)
  useEffect(() => {
    if (!rightPanelContextId) return;
    const handleClick = (e: MouseEvent) => {
      setRightPanelContextId(null);
      setRightPanelContextPos(null);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [rightPanelContextId]);
  const [objects, setObjects] = useState<any[]>([]);
  const [selected, setSelected] = useState<any[]>([]);
  const [positions, setPositions] = useState<{ [key: string]: { x: number; y: number } }>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [contextMenuInstance, setContextMenuInstance] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor));
  const [lastCollision, setLastCollision] = useState<{ a: string; b: string } | null>(null);
  const lastCollisionRef = useRef<{ a: string; b: string } | null>(null);
  const rightListRef = useRef<HTMLDivElement>(null);
  const rightListAsideRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    fetch("http://localhost:4000/api/objects")
      .then((res) => res.json())
      .then((data) => setObjects(data))
      .catch(() => setObjects([]));
  }, []);


  // For measuring new item size
  const measureRef = useRef<HTMLDivElement>(null);
  const [pendingSpawn, setPendingSpawn] = useState<any | null>(null);

  // Modified spawn: first spawn at center, then move after measuring
  const handleListItemClick = (item: any) => {
    const instanceId = makeInstanceId(item);
    setPendingSpawn({ item, instanceId });
    // Add to selected at center, will move after measure
    const playArea = dropAreaRef.current;
    let centerX = 200, centerY = 100;
    let areaW = 400, areaH = 200;
    if (playArea) {
      const rect = playArea.getBoundingClientRect();
      areaW = rect.width;
      areaH = rect.height;
      centerX = Math.floor(areaW / 2 - 60);
      centerY = Math.floor(areaH / 2 - 20);
    }
    setSelected((prevSelected) => [
      ...prevSelected,
      { ...item, __instanceId: instanceId }
    ]);
    setPositions((prevPositions) => ({
      ...prevPositions,
      [instanceId]: { x: centerX, y: centerY }
    }));
  };

  // After render, if pendingSpawn, measure and move to best spot
  useEffect(() => {
    if (!pendingSpawn) return;
    // If the item is not already in selected, add it (for merges)
    setSelected((prevSelected) => {
      if (prevSelected.some(i => i.__instanceId === pendingSpawn.instanceId)) return prevSelected;
      // Estimate center position for initial render (will be corrected after measuring)
      const playArea = dropAreaRef.current;
      let centerX = 200, centerY = 100;
      let areaW = 400, areaH = 200;
      let boxW = 120, boxH = 40;
      if (playArea) {
        const rect = playArea.getBoundingClientRect();
        areaW = rect.width;
        areaH = rect.height;
        centerX = Math.floor(areaW / 2 - boxW / 2);
        centerY = Math.floor(areaH / 2 - boxH / 2);
      }
      setPositions((prevPositions) => ({
        ...prevPositions,
        [pendingSpawn.instanceId]: { x: centerX, y: centerY }
      }));
      return [...prevSelected, { ...pendingSpawn.item, __instanceId: pendingSpawn.instanceId }];
    });
    // Always re-create the candidate array for each spawn, using the latest positions and measurements
    const { instanceId } = pendingSpawn;
    const el = document.getElementById(`draggable-item-${selected.findIndex(i => i.__instanceId === instanceId)}`);
    if (!el) return;
    const playArea = dropAreaRef.current;
    if (!playArea) return;
    const rect = playArea.getBoundingClientRect();
    const areaW = rect.width;
    const areaH = rect.height;
    const boxW = el.offsetWidth;
    const boxH = el.offsetHeight;
    const centerX = Math.floor(areaW / 2 - boxW / 2);
    const centerY = Math.floor(areaH / 2 - boxH / 2);
    // Build the taken array fresh each time
    const taken: { x: number, y: number, w: number, h: number }[] = Object.entries(positions)
      .filter(([k]) => k !== instanceId)
      .map(([k, pos]) => {
        const idx = selected.findIndex(i => i.__instanceId === k);
        const el2 = document.getElementById(`draggable-item-${idx}`);
        return {
          x: pos.x,
          y: pos.y,
          w: el2 ? el2.offsetWidth : 120,
          h: el2 ? el2.offsetHeight : 40
        };
      });
    // Always check the exact center first as a candidate (no jitter)
    const candidates: { x: number, y: number, dist: number, jitter: boolean }[] = [
      { x: centerX, y: centerY, dist: 0, jitter: false }
    ];
    // Then generate the rest of the grid (excluding the exact center to avoid duplicate)
    for (let tryY = 0; tryY <= areaH - boxH; tryY += 5) {
      for (let tryX = 0; tryX <= areaW - boxW; tryX += 5) {
        if (tryX === centerX && tryY === centerY) continue;
        const dist = Math.hypot(tryX - centerX, tryY - centerY);
        candidates.push({ x: tryX, y: tryY, dist, jitter: true });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    // Use the actual measured box size for collision
    let foundZero = false;
    let bestZeroX = centerX, bestZeroY = centerY, minZeroDist = Number.POSITIVE_INFINITY;
    let minOverlap = Number.POSITIVE_INFINITY;
    let bestX = centerX, bestY = centerY;
    const jitter = 6;
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      let tryX = cand.x;
      let tryY = cand.y;
      if (cand.jitter) {
        tryX += Math.round((Math.random() - 0.5) * jitter);
        tryY += Math.round((Math.random() - 0.5) * jitter);
      }
      if (tryX < 0 || tryY < 0 || tryX + boxW > areaW || tryY + boxH > areaH) continue;
      let overlapArea = 0;
      for (const pos of taken) {
        const xOverlap = Math.max(0, Math.min(tryX + boxW, pos.x + pos.w) - Math.max(tryX, pos.x));
        const yOverlap = Math.max(0, Math.min(tryY + boxH, pos.y + pos.h) - Math.max(tryY, pos.y));
        overlapArea += xOverlap * yOverlap;
      }
      // Allow a tiny margin for floating point errors
      if (overlapArea < 1e-2) {
        const dist = Math.hypot(tryX - centerX, tryY - centerY);
        if (dist < minZeroDist) {
          minZeroDist = dist;
          bestZeroX = tryX;
          bestZeroY = tryY;
          foundZero = true;
        }
      } else if (overlapArea < minOverlap) {
        minOverlap = overlapArea;
        bestX = tryX;
        bestY = tryY;
      }
    }
    let spawnX, spawnY;
    if (foundZero) {
      spawnX = bestZeroX;
      spawnY = bestZeroY;
    } else if (minOverlap < Number.POSITIVE_INFINITY) {
      spawnX = bestX;
      spawnY = bestY;
    } else {
      // fallback: random shift in 10px circle
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * 10;
      spawnX = Math.round(centerX + radius * Math.cos(angle));
      spawnY = Math.round(centerY + radius * Math.sin(angle));
    }
    setPositions((prevPositions) => ({
      ...prevPositions,
      [instanceId]: { x: spawnX, y: spawnY }
    }));
    setPendingSpawn(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSpawn, positions, selected]);

  // Right-click to remove item from play area
  const handleBoxContextMenu = (instanceId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setSelected((prevSelected) => prevSelected.filter((item) => item.__instanceId !== instanceId));
    setPositions((prevPositions) => {
      const newPositions = { ...prevPositions };
      delete newPositions[instanceId];
      return newPositions;
    });
    setContextMenuInstance(null);
    setContextMenuPos(null);
  };

  // Upvote/downvote handlers
  const handleVote = async (id: string, type: 'up' | 'down') => {
    try {
      const resp = await fetch(`http://localhost:4000/api/objects`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, vote: type })
      });
      // Optionally handle response here if needed
      await resp.json();
    } catch (err) {
      console.error('Vote error:', err);
    }
    setContextMenuInstance(null);
    setContextMenuPos(null);
    setRightPanelContextId(null);
    setRightPanelContextPos(null);
    // TODO: Prevent multiple upvotes/downvotes per user (e.g. via localStorage or backend user tracking)
  };

  // Click outside to close context menu
  useEffect(() => {
    if (!contextMenuInstance) return;
    const handleClick = (e: MouseEvent) => {
      setContextMenuInstance(null);
      setContextMenuPos(null);
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [contextMenuInstance]);

  // When a new item is added to selected, set its initial position if not already set
  useEffect(() => {
    if (selected.length === 0) return;
    const lastIdx = selected.length - 1;
    const item = selected[lastIdx];
    const key = item.id || `${item.name}-${lastIdx}`;
    setPositions((prevPositions) => {
      if (prevPositions[key]) return prevPositions;
      return {
        ...prevPositions,
        [key]: { x: 10 + 30 * (lastIdx % 5), y: 10 + 30 * Math.floor(lastIdx / 5) },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    lastCollisionRef.current = lastCollision;
  }, [lastCollision]);

  // Collision detection helper
  function isColliding(a: DOMRect, b: DOMRect) {
    return (
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    );
  }

  // On drag start
  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
    setLastCollision(null);
  };

  // On drag end, update position and check for collision
  const handleDragEnd = async (event: any) => {
    const { active, delta } = event;
    setActiveId(null);
    if (!active) return;
    const key = active.id;
    // Calculate new position
    let newX = (positions[key]?.x ?? 0) + delta.x;
    let newY = (positions[key]?.y ?? 0) + delta.y;
    const playArea = dropAreaRef.current;
    if (playArea) {
      const areaRect = playArea.getBoundingClientRect();
      // Assume box size 120x40
      const maxX = areaRect.width - 120;
      const maxY = areaRect.height - 40;
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
    }
    const newPos = { x: newX, y: newY };
    // Check for collision with other items
    const thisRect = {
      left: newPos.x,
      right: newPos.x + 120,
      top: newPos.y,
      bottom: newPos.y + 40,
    };
    let collidedWith: string | null = null;
    for (let j = 0; j < selected.length; j++) {
      const otherInstanceId = selected[j].__instanceId;
      if (otherInstanceId === key) continue;
      const otherPos = positions[otherInstanceId] || { x: 0, y: 0 };
      const otherRect = {
        left: otherPos.x,
        right: otherPos.x + 120,
        top: otherPos.y,
        bottom: otherPos.y + 40,
      };
      if (isColliding(thisRect as any, otherRect as any)) {
        collidedWith = otherInstanceId;
        break;
      }
    }
    if (collidedWith) {
      // Find the two colliding items by instanceId
      const item1 = selected.find((s) => s.__instanceId === key);
      const item2 = selected.find((s) => s.__instanceId === collidedWith);
      if (!item1 || !item2 || !item1.id || !item2.id) {
        // Ignore error, keep both items
        setPositions((prev) => ({ ...prev, [key]: newPos }));
        return;
      }
      // Call backend to merge
      try {
        const resp = await fetch("http://localhost:4000/api/paths/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent1: item1.id, parent2: item2.id })
        });
        if (resp.status === 400) {
          // Backend rejected the merge, keep both items in play area and ensure no invalid merged object is shown
          setPositions((prev) => ({ ...prev, [key]: newPos }));
          setSelected((prevSelected) => prevSelected.filter((item) => item.__instanceId !== undefined && item.__instanceId !== null));
          return;
        }
        if (resp.status === 500) {
          // Internal server error, keep both items in play area and optionally show a message
          setPositions((prev) => ({ ...prev, [key]: newPos }));
          // Optionally: show a toast or alert here
          return;
        }
        const data = await resp.json();
        if (data.success && data.leaf && data.leafID) {
          // Remove both colliding objects and add the merged result using the same spawn logic as new items
          const mergedInstanceId = makeInstanceId({ id: data.leafID, name: data.leaf });
          setSelected((prevSelected) => {
            const filtered = prevSelected.filter((item) =>
              item.__instanceId !== key && item.__instanceId !== collidedWith
            );
            // Do not add merged item here; let pendingSpawn handle it
            return filtered;
          });
          setPositions((prev) => {
            const newPositions = { ...prev };
            delete newPositions[key];
            delete newPositions[collidedWith!];
            // Do not set mergedInstanceId position here; let spawn logic handle it
            return newPositions;
          });
          setPendingSpawn({ item: { id: data.leafID, name: data.leaf, icons: [data.icon] }, instanceId: mergedInstanceId });
          // Add to right list if not already present
          setObjects((prevObjects) => {
            if (prevObjects.some((o) => o.id === data.leafID)) return prevObjects;
            return [
              ...prevObjects,
              { id: data.leafID, name: data.leaf, icons: [data.icon] }
            ];
          });
        } else {
          // If merge failed, keep both items in play area
          setPositions((prev) => ({ ...prev, [key]: newPos }));
        }
      } catch (e) {
        // On request error, keep both items in play area
        setPositions((prev) => ({ ...prev, [key]: newPos }));
      }
    } else {
      setPositions((prev) => ({ ...prev, [key]: newPos }));
    }
  };

  // Show scroll-to-top button when scrolled down and scrollbar is visible
  useEffect(() => {
    const el = rightListAsideRef.current;
    if (!el) return;
    const checkScroll = () => {
      const hasScrollbar = el.scrollHeight > el.clientHeight;
      setShowScrollTop(hasScrollbar && el.scrollTop > 0);
    };
    checkScroll();
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [objects]);

  const handleScrollTop = () => {
    rightListAsideRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="row-start-2 w-full h-full flex flex-col sm:flex-row gap-8 items-stretch">
        {/* Left segment: 75% width, interactive area */}
        <section className="w-full sm:w-3/4 flex flex-col gap-8 justify-start">
          {/* Expanded interactive area, no label */}
          <div className="bg-white dark:bg-black/30 rounded-lg shadow flex-1 flex flex-col justify-center items-center border border-gray-200 dark:border-gray-700 min-h-[300px] max-h-full h-full p-0">
            <div
              className="relative w-full h-full min-h-[300px] max-h-full border-dashed border-2 border-gray-300 dark:border-gray-600 bg-transparent rounded-lg"
              ref={dropAreaRef}
            >
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                collisionDetection={closestCenter}
              >
                {selected.length === 0 && (
                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-400">Click an item to add it here.</span>
                )}
                {selected.map((item, idx) => {
                  const instanceId = item.__instanceId;
                  const pos = positions[instanceId] || { x: 10, y: 10 };
                  return (
                    <React.Fragment key={instanceId}>
                      <DraggableBox
                        id={instanceId}
                        idx={idx}
                        x={pos.x}
                        y={pos.y}
                        activeId={activeId}
                        icons={item.icons}
                        name={item.name}
                        idStr={item.id}
                        onContextMenu={handleBoxContextMenu(instanceId)}
                      />
                    </React.Fragment>
                  );
                })}
                <DragOverlay>
                  {activeId && (() => {
                    const idx = selected.findIndex((item) => item.__instanceId === activeId);
                    if (idx === -1) return null;
                    const item = selected[idx];
                    return (
                      <DraggableBox
                        id={activeId}
                        idx={idx}
                        x={0}
                        y={0}
                        activeId={activeId}
                        icons={item.icons}
                        name={item.name}
                        idStr={item.id}
                        isOverlay
                      />
                    );
                  })()}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        </section>
        {/* Right segment: 25% width, dynamic list */}
        <aside
          className="w-full sm:w-1/4 flex flex-col min-h-[300px] max-h-[80vh] relative overflow-y-auto"
          ref={rightListAsideRef}
          style={{ height: '80vh' }}
        >
          <div
            className="grid grid-cols-2 gap-1 font-mono text-sm/6 break-words"
            style={{ paddingRight: '0.5rem' }}
          >
            {objects.map((obj, idx) => (
              <div
                key={obj.id || idx}
                className="bg-gray-100 dark:bg-gray-800 rounded px-2 py-1 flex items-center gap-1 cursor-pointer border border-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition whitespace-nowrap overflow-hidden text-ellipsis"
                title={obj.id ? `ID: ${obj.id}` : undefined}
                onClick={() => handleListItemClick(obj)}
                onContextMenu={e => {
                  e.preventDefault();
                  setRightPanelContextId(obj.id);
                  setRightPanelContextPos({ x: e.clientX, y: e.clientY });
                }}
                style={{ minHeight: 32, maxHeight: 32, height: 32, maxWidth: '100%' }}
              >
                {Array.isArray(obj.icons) && obj.icons.slice(0, 3).map((icon: string, i: number) =>
                  icon ? (
                    icon.startsWith("/") ? (
                      <img key={i} src={icon} alt="icon" width={16} height={16} style={{ display: 'inline-block' }} />
                    ) : (
                      <span key={i} style={{ fontSize: 18 }}>{icon}</span>
                    )
                  ) : null
                )}
                <span className="overflow-hidden text-ellipsis whitespace-nowrap block" style={{ maxWidth: 'calc(100% - 24px)' }}>{obj.name || obj.id || `Item ${idx + 1}`}</span>
                {/* Emoji popup for right panel */}
                {rightPanelContextId === obj.id && rightPanelContextPos && (
                  <div
                    style={{
                      position: 'fixed',
                      left: rightPanelContextPos.x,
                      top: rightPanelContextPos.y,
                      zIndex: 9999,
                      background: 'white',
                      border: '1px solid #ccc',
                      borderRadius: 8,
                      boxShadow: '0 2px 8px #0002',
                      padding: '4px 12px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                    }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      style={{ fontSize: 22, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                      title="Thumbs up"
                      aria-label="Thumbs up"
                      onClick={e => {
                        e.stopPropagation();
                        handleVote(obj.id, 'up');
                      }}
                    >👍</button>
                    <button
                      type="button"
                      style={{ fontSize: 22, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                      title="Thumbs down"
                      aria-label="Thumbs down"
                      onClick={e => {
                        e.stopPropagation();
                        handleVote(obj.id, 'down');
                      }}
                    >👎</button>
                  </div>
                )}
              </div>
            ))}

          </div>
          {/* Scroll-to-top button */}
          {showScrollTop && rightListAsideRef.current &&
            createPortal(
              <button
                onClick={handleScrollTop}
                className="fixed right-8 bottom-8 z-50 bg-blue-500 text-white rounded-full shadow-lg p-2 hover:bg-blue-600 transition"
                aria-label="Scroll to top"
              >
                ↑ Top
              </button>,
              rightListAsideRef.current
            )
          }
        </aside>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        <p className="text-sm/6 text-center sm:text-left">
          This is an experimental front-end for ollama-based word jam llm game.
        </p>
      </footer>
    </div>
  );
}
