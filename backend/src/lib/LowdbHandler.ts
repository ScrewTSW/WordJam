// Explicit exports for TypeScript consumers
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';
import { Mutex } from 'async-mutex';

// Voting thresholds
const UPVOTE_ACCEPT_THRESHOLD = 9;
const DOWNVOTE_DELETE_THRESHOLD = 4;
const initialObjects: DepGraphObject[] = [
  { id: "WATER", name: "Water", icons: ["💧"], parentPairs: [], timeCreated: new Date().toISOString(), uuid: "admin", upvoteCount: 0, downvoteCount: 0, approved: true },
  { id: "FIRE", name: "Fire", icons: ["🔥"], parentPairs: [], timeCreated: new Date().toISOString(), uuid: "admin", upvoteCount: 0, downvoteCount: 0, approved: true },
  { id: "EARTH", name: "Earth", icons: ["🌍"], parentPairs: [], timeCreated: new Date().toISOString(), uuid: "admin", upvoteCount: 0, downvoteCount: 0, approved: true },
  { id: "WIND", name: "Wind", icons: ["💨"], parentPairs: [], timeCreated: new Date().toISOString(), uuid: "admin", upvoteCount: 0, downvoteCount: 0, approved: true }
];

// Strongly-typed interface for dependency graph objects
export interface DepGraphObject {
  id: string;
  name: string;
  icons: string[];
  parentPairs: [string, string][];
  timeCreated?: string;
  uuid?: string;
  upvoteCount?: number;
  downvoteCount?: number;
  approved?: boolean;
}

export interface DepGraphDB {
  objects: DepGraphObject[];
}

export interface LowdbHandlerContract<T> {
  read(): Promise<void>;
  write(): Promise<void>;
  getData(): T | undefined;
  setData(data: T): void;
}

class LowdbHandler implements LowdbHandlerContract<DepGraphDB> {
  /**
   * Increment upvoteCount for an object by id.
   */
  async upvoteItemEntry(id: string) {
    await this.read();
    if (!this.db.data) return;
    const obj = this.db.data.objects.find((o) => o.id === id);
    if (obj) {
      obj.upvoteCount = (obj.upvoteCount || 0) + 1;
      if (obj.upvoteCount > UPVOTE_ACCEPT_THRESHOLD) {
        obj.approved = true;
      }
      await this.write();
    }
  }

  /**
   * Increment downvoteCount for an object by id.
   */
  async downvoteItemEntry(id: string) {
    await this.read();
    if (!this.db.data) return;
    const obj = this.db.data.objects.find((o) => o.id === id);
    if (obj) {
      obj.downvoteCount = (obj.downvoteCount || 0) + 1;
      const upvotes = obj.upvoteCount || 0;
      const downvotes = obj.downvoteCount || 0;
      // Only delete if not approved, or if downvotes > 75% of upvotes
      const shouldDelete =
        (obj.approved !== true && downvotes > DOWNVOTE_DELETE_THRESHOLD) ||
        (obj.approved == true && downvotes > 0.75 * upvotes);
      if (shouldDelete) {
        this.db.data.objects = this.db.data.objects.filter((o) => o.id !== id);
      }
      await this.write();
    }
  }
  /**
   * Reset the database to the initial four elements.
   */
  async resetToInitialObjects() {
    await this.read();
    this.setData({ objects: initialObjects });
    await this.write();
  }
  private db: Low<DepGraphDB>;
  private mutex: Mutex;

  constructor(filePath?: string, defaultData?: DepGraphDB) {
    // Set default file path and data for Words DB
    const dbPath = filePath || path.resolve(process.cwd(), 'data/words.json');
    const initialData = defaultData || { objects: initialObjects };

    // If file does not exist, initialize with default data
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
    }

    const adapter = new JSONFile<DepGraphDB>(dbPath);
    this.db = new Low<DepGraphDB>(adapter, initialData);
    this.mutex = new Mutex();
  }


  async read() {
    return this.mutex.runExclusive(async () => {
      await this.db.read();
    });
  }

  async write() {
    return this.mutex.runExclusive(async () => {
      await this.db.write();
    });
  }

  getData() {
    return this.db.data;
  }

  setData(data: DepGraphDB) {
    this.db.data = data;
  }


  /**
   * Insert an object into the dependency graph.
   * Each object holds an array of parent pairs (tuples) that can produce it.
   * @param obj The object to insert (must have id, name)
   * @param parentPair Array of two parent ids (or null for root)
   */
  async insertObject(
    obj: { id: string; name: string; icons?: string[] },
    parentPair: [string, string] | null = null,
    timeCreated?: string,
    uuid?: string
  ) {
    await this.read();
    if (!this.db.data) return;
    const objects = this.db.data.objects;
    let existing = objects.find((o) => o.id === obj.id);
    if (!existing) {
      // New object, add to objects
      objects.push({
        id: obj.id,
        name: obj.name,
        icons: obj.icons ?? [],
        parentPairs: parentPair ? [parentPair] : [],
        timeCreated: timeCreated || new Date().toISOString(),
        uuid: uuid || 'static-uuid-1234',
        upvoteCount: 0,
        downvoteCount: 0,
        approved: false
      });
    } else {
      // Existing object, add new parent pair if needed
      if (parentPair) {
        existing.parentPairs = existing.parentPairs || [];
        // Check if this pair already exists (order-insensitive)
        const exists = existing.parentPairs.some((pair) =>
          (pair[0] === parentPair[0] && pair[1] === parentPair[1]) ||
          (pair[0] === parentPair[1] && pair[1] === parentPair[0])
        );
        if (!exists) {
          existing.parentPairs.push(parentPair);
        }
      }
      // Optionally update icons and name if provided
      if (obj.icons) existing.icons = obj.icons;
      if (obj.name) existing.name = obj.name;
      // Do not overwrite timeCreated or uuid for existing objects
    }
    await this.write();
  }


  /**
   * Remove a parent pair route from an object. If no more parent pairs, remove the object.
   * @param id The id of the object to remove
   * @param parentPair The parent pair to remove (or null to remove all routes)
   */
  async removeObject(id: string, parentPair: [string, string] | null = null) {
    await this.read();
    if (!this.db.data) return;
    const objects = this.db.data.objects;
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    if (parentPair) {
      // Remove parent pair route (order-insensitive)
      obj.parentPairs = (obj.parentPairs || []).filter((pair) =>
        !((pair[0] === parentPair[0] && pair[1] === parentPair[1]) ||
          (pair[0] === parentPair[1] && pair[1] === parentPair[0]))
      );
      // If still has other parent pairs, keep the object
      if (obj.parentPairs && obj.parentPairs.length > 0) {
        await this.write();
        return;
      }
    }
    // Remove the object itself
    const idx = objects.findIndex((o) => o.id === id);
    if (idx !== -1) objects.splice(idx, 1);
    await this.write();
  }

  /**
   * Find all paths from any root to the given leaf, up to maxHops.
   * Each path is an array of node ids from root to leaf.
   * Returns null if no path is found.
   */
  async getAllPathsToLeafFromRoots(leafId: string, maxHops: number): Promise<string[][] | null> {
    await this.read();
    if (!this.db.data) return null;
    const objects = this.db.data.objects;
    const objMap = new Map(objects.map((o) => [o.id, o]));

    // Helper: recursively build all paths from roots to leaf
    function dfs(currentId: string, path: string[], hops: number, visited: Set<string>, results: string[][]) {
      if (hops > maxHops) return;
      if (visited.has(currentId)) return; // cycle protection
      visited.add(currentId);
      const current = objMap.get(currentId);
      if (!current) return;
      if (!current.parentPairs || current.parentPairs.length === 0) {
        // This is a root
        results.push([currentId, ...path]);
        visited.delete(currentId);
        return;
      }
      for (const pair of current.parentPairs) {
        for (const parentId of pair) {
          dfs(parentId, [currentId, ...path], hops + 1, visited, results);
        }
      }
      visited.delete(currentId);
    }

    const results: string[][] = [];
    dfs(leafId, [], 0, new Set(), results);
    const trimmed = this.trimPaths(results, 5);
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
 * Find all direct paths from a source leaf to a target leaf, up to maxHops.
 * Each path is an array of node ids from source to target.
 * Returns null if no path is found.
 */
  async getPathsToLeafFromLeaf(sourceLeafId: string, targetLeafId: string, maxHops: number): Promise<string[][] | null> {
    await this.read();
    if (!this.db.data) return null;
    const objects: DepGraphObject[] = this.db.data.objects;
    const objMap: Map<string, DepGraphObject> = new Map(objects.map((o) => [o.id, o]));

    // Helper: recursively build all paths from source to target
    function dfs(
      currentId: string,
      path: string[],
      hops: number,
      visited: Set<string>,
      results: string[][]
    ): void {
      if (hops > maxHops) return;
      if (visited.has(currentId)) return; // cycle protection
      visited.add(currentId);
      if (currentId === targetLeafId) {
        results.push([...path, currentId]);
        visited.delete(currentId);
        return;
      }
      const current = objMap.get(currentId);
      if (!current || !Array.isArray(current.parentPairs)) {
        visited.delete(currentId);
        return;
      }
      for (const pair of current.parentPairs) {
        for (const parentId of pair) {
          dfs(parentId, [...path, currentId], hops + 1, visited, results);
        }
      }
      visited.delete(currentId);
    }

    const results: string[][] = [];
    dfs(sourceLeafId, [], 0, new Set(), results);
    const trimmed = this.trimPaths(results, 5);
    return trimmed.length > 0 ? trimmed : null;
  }


  /**
   * Helper to trim paths to those within maxDelta of the shortest path.
   */
  private trimPaths(paths: string[][], maxDelta: number = 5): string[][] {
    if (paths.length === 0) return [];
    const minLen = Math.min(...paths.map((p: string[]) => p.length));
    return paths.filter((p: string[]) => p.length <= minLen + maxDelta);
  }
}
export { LowdbHandler };
