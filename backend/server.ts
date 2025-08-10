import axios from 'axios';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import { LowdbHandler } from './src/lib/LowdbHandler.js';
import { SqliteHandler } from './src/lib/SqliteHandler.js';

// Constants
const USERS_DB_PATH = 'data/users.db';
const WORDS_DB_PATH = 'data/words.json';
const PORT = process.env.PORT || 4000;
const MODEL_NAME = 'L3.2-8X4B-MOE-V2-Dark-Champion-Inst-21B-uncen-ablit-D_AU-Q8_0-infinite-craft:latest';
const LLM_API_URL = 'http://localhost:11434/api/generate';
const LLM_HEADER = { 'Content-Type': 'application/json' };
const MAX_LEAF_LENGTH = 48;
const MAX_WORDS = 6;
const MAX_HYPHENS = 3;
const VOTE_TYPES = ['up', 'down'];
const OBJECTS_PATH = '/api/objects';
const PATHS_TO_LEAF_PATH = '/api/paths/to-leaf/:leafId';
const PATHS_LEAF_TO_LEAF_PATH = '/api/paths/leaf-to-leaf';
const PATHS_GENERATE_PATH = '/api/paths/generate';
const HEALTH_PATH = '/api/health';

const app = express();
app.use(cors());
app.use(express.json());

const db = new LowdbHandler(WORDS_DB_PATH);
const users = new SqliteHandler(USERS_DB_PATH);

const SYSTEM_PROMPT = `
IMPORTANT: DO NOT EXPLAIN YOURSELF. DO NOT SHOW REASONING. DO NOT THINK OUT LOUD. DO NOT ASK FOLLOW-UP QUESTIONS.
ONLY output the RESPONSE and ICON as instructed. No extra text, no thoughts, no explanations, no reasoning, no preambles.

You are the brain and the engine behind a wordcrafting game.
The goal of the user is to build complex themes and dictionary from just the base elements:
Water, Fire, Wind, Earth
You will receive two inputs formatted as: INPUT1:<text> INPUT2:<text>

Your job is to:
1. Creatively combine the two input words or phrases into a single word or a very short phrase.
2. Use dictionary, science, or culture as inspiration when possible.
3. If the inputs are complex, extract their basic meaning or concept into a word or phrase.
4. If one input is a command (e.g., cut, explode, shrink), perform the action on the other input.
5. Keep your response extremely short—just a word or a very short phrase.
Always respond in the format: RESPONSE:<word_or_short_phrase> ICON:<appropriate_emoji>
No explanation. No extra text. No reasoning, just the response.

BAD EXAMPLES (DO NOT DO THIS):
<think>
Okay, the user input is FIRE and WATER. Let me think about how to combine these two elements. Fire and water are opposites, so maybe...
RESPONSE: Steam ICON: 💨

GOOD EXAMPLES (DO THIS):
RESPONSE: Steam ICON: 💨

Examples:
INPUT1:Fire INPUT2:Water
RESPONSE:Steam ICON:💨

INPUT1:Water INPUT2:Wind
RESPONSE:Mist ICON:🌫️

INPUT1:Water INPUT2:Water
RESPONSE:Lake ICON:🏞️

INPUT1:Water INPUT2:Lake
RESPONSE:Sea ICON:🌊

INPUT1:Water INPUT2:Sea
RESPONSE:Ocean ICON:🌊

INPUT1:Water INPUT2:Mountain
RESPONSE:River ICON:🏞️

INPUT1:Earth INPUT2:Earth
RESPONSE:Land ICON:🌍

INPUT1:Earth INPUT2:Land
RESPONSE:Mountain ICON:⛰️

INPUT1:Water INPUT2:Earth
RESPONSE:Sand ICON:⏳

INPUT1:Cut INPUT2:Melting Snowman
RESPONSE:Melting ICON:🫠

INPUT1:Cut INPUT2:Melting Snowman
RESPONSE:Snowman ICON:☃️

INPUT1:1 INPUT2:Melting Snowman
RESPONSE:Melting ICON:🫠

INPUT1:2 INPUT2:Meltong Snowman
RESPONSE:Snowman ICON:☃️

INPUT1:1 INPUT2:1
RESPONSE:2 ICON:2️⃣

INPUT1:Sun INPUT2:Flower
RESPONSE:Sunflower ICON:🌻

INPUT1:Book INPUT2:Worm
RESPONSE:Bookworm ICON:🤓

REMEMBER: NO EXPLANATION. NO REASONING. ONLY THE RESPONSE AND ICON. DO NOT ASK FOLLOW-UP QUESTIONS.
`;

app.get(HEALTH_PATH, (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Get all objects
app.get(OBJECTS_PATH, async (_req: Request, res: Response) => {
  await db.read();
  res.json(db.getData()?.objects || []);
});

// Insert an object
app.post(OBJECTS_PATH, async (req: Request, res: Response) => {
  const { id, name, icons, parentPair } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' });
  }
  await db.insertObject({ id, name, icons }, parentPair ?? null);
  console.log(`[POST /api/objects] Inserted object:`, { id, name });
  res.status(201).json({ success: true });
});

// Remove an object or parent pair
app.delete(`${OBJECTS_PATH}/:id`, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { parentPair } = req.body;
  await db.removeObject(id, parentPair ?? null);
  console.log(`[DELETE /api/objects/:id] Removed object:`, { id, parentPair });
  res.json({ success: true });
});

// Upvote or downvote an object
app.patch(OBJECTS_PATH, async (req: Request, res: Response) => {
  const { id, vote } = req.body;
  if (!id || !VOTE_TYPES.includes(vote)) {
    return res.status(400).json({ error: 'id and vote (up|down) are required' });
  }
  // Use LowdbHandler methods for voting
  let updatedObj;
  if (vote === 'up') {
    await db.upvoteItemEntry(id);
    console.log(`[PATCH /api/objects] Upvoted:`, id);
  } else {
    await db.downvoteItemEntry(id);
    console.log(`[PATCH /api/objects] Downvoted:`, id);
  }
  await db.read();
  const objects = db.getData()?.objects || [];
  updatedObj = objects.find((o: any) => o.id === id);
  if (!updatedObj) {
    return res.status(404).json({ error: 'Object not found after voting' });
  }
  res.json({ success: true, upvoteCount: updatedObj.upvoteCount, downvoteCount: updatedObj.downvoteCount });
});

// Reset the database to the initial four elements
app.delete(OBJECTS_PATH, async (_req: Request, res: Response) => {
  await db.resetToInitialObjects();
  res.json({ success: true });
});

// Get all paths from roots to a leaf
app.get(PATHS_TO_LEAF_PATH, async (req: Request, res: Response) => {
  const { leafId } = req.params;
  const maxHops = parseInt(req.query.maxHops as string) || 10;
  const paths = await db.getAllPathsToLeafFromRoots(leafId, maxHops);
  res.json({ paths });
});

// Get all paths from a source leaf to a target leaf
app.get(PATHS_LEAF_TO_LEAF_PATH, async (req: Request, res: Response) => {
  const { sourceLeafId, targetLeafId, maxHops } = req.query;
  if (!sourceLeafId || !targetLeafId) {
    return res.status(400).json({ error: 'sourceLeafId and targetLeafId are required' });
  }
  const paths = await db.getPathsToLeafFromLeaf(
    sourceLeafId as string,
    targetLeafId as string,
    parseInt(maxHops as string) || 10
  );
  res.json({ paths });
});

// Generate a path using a third-party service
app.post(PATHS_GENERATE_PATH, async (req: Request, res: Response) => {
  const { parent1, parent2 } = req.body;
  if (!parent1 || !parent2) {
    return res.status(400).json({ error: 'parent1 and parent2 are required' });
  }
  await db.read();
  const objects = db.getData()?.objects || [];
  const valid1 = objects.some(obj => obj.id === parent1);
  const valid2 = objects.some(obj => obj.id === parent2);
  if (!valid1 || !valid2) {
    return res.status(400).json({ error: 'parent1 and parent2 must be valid object IDs' });
  }

  // Check for existing approved leaf with these parents (using parentPairs and approved)
  const found = objects.find(obj => {
    if (!obj.parentPairs || !Array.isArray(obj.parentPairs)) return false;
    // Accept both [parent1, parent2] and [parent2, parent1] order
    const hasPair = obj.parentPairs.some(
      (pair: [string, string]) =>
        pair.length === 2 &&
        ((pair[0] === parent1 && pair[1] === parent2) || (pair[0] === parent2 && pair[1] === parent1))
    );
    return hasPair && obj.approved === true;
  });
  if (found) {
    // Return the found object in the same format as LLM response
    return res.status(200).json({
      success: true,
      leaf: found.name,
      leafID: found.id,
      icon: Array.isArray(found.icons) ? found.icons[0] : undefined,
      fromCache: true
    });
  }

  // If not found, call LLM API as before
  try {
    const payload = {
      model: MODEL_NAME,
      prompt: `<|im_start|>system\n${SYSTEM_PROMPT}\n<|im_end|>\n<|im_start|>user\nINPUT1:${parent1} INPUT2:${parent2}\n<|im_end|>\n<|im_start|>assistant\n`,
      stream: false,
      think: false,
      num_experts_used: 6
    };
    const response = await axios.post(LLM_API_URL, payload, { headers: LLM_HEADER });
    console.log('Third-party response:', response.data);
    const llmResponse = response.data.response || '';
    // Robustly parse llmResponse for RESPONSE: and ICON:
    let leaf = null;
    let leafID = null;
    let icon = null;
    // Extract text after RESPONSE: up to ICON:, newline, or <
    const responseMatch = llmResponse.match(/RESPONSE:\s*([^\n<]*?)(?:\s*ICON:|\n|<|$)/i);
    if (responseMatch) {
      leaf = responseMatch[1].trim();
      leafID = leaf.toUpperCase().replace(/\s+/g, '-');
    }
    // Extract text after ICON: up to newline or <
    const iconMatch = llmResponse.match(/ICON:\s*([^\n<]*)/i);
    if (iconMatch) {
      icon = iconMatch[1].trim();
      icon = icon.replace(/<.*$/, '').trim();
    }
    // If leaf or leafID is missing, return 500 (internal error)
    if (!leaf || !leafID) {
      return res.status(500).json({ error: 'Internal server error: failed to parse LLM response', raw: llmResponse });
    }
    // Discard if leaf is too long, contains a period/comma, or is likely a sentence
    // Treat hyphens as word separators for word count
    const wordCount = leaf.trim().split(/[\s\-]+/).length;
    // Ban if more than MAX_HYPHENS, or consecutive hyphens, or starts/ends with hyphen
    const hyphenCount = (leaf.match(/-/g) || []).length;
    if (
      leaf.length > MAX_LEAF_LENGTH ||
      /[\.,!?]/.test(leaf) ||
      wordCount > MAX_WORDS ||
      leaf.includes(',') ||
      hyphenCount > MAX_HYPHENS ||
      /--/.test(leaf) ||
      leaf.startsWith('-') ||
      leaf.endsWith('-')
    ) {
      return res.status(400).json({ error: 'Generated item is too long, contains a forbidden character, too many hyphens, or is sentence-like and was discarded', leaf, raw: llmResponse });
    }
    // Check if object already exists
    const exists = objects.some(obj => obj.id === leafID);
    if (!exists) {
      // Use created_at from LLM response if available, otherwise use current time
      const timeCreated = response.data.created_at || new Date().toISOString();
      await db.insertObject({ id: leafID, name: leaf, icons: [icon] }, [parent1, parent2], timeCreated);
    }
    // If exists, do not overwrite icons
    res.status(200).json({ success: true, leaf, leafID, icon, raw: llmResponse });
  } catch (error) {
    console.error('Error calling third-party service:', error);
    res.status(500).json({ error: 'Internal server error: failed to generate path' });
  }
});

app.listen(PORT, () => {
  db.read(); // Ensure Lowdb is initialized
  users.getDB(); // Ensure SQLite DB is initialized
  console.log(`Backend server running on port ${PORT}`);
});
