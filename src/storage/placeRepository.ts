/**
 * Places — the user's distinct spots (office desk, comfy chair, couch), each
 * with its own scene signature and calibrations. Stores only the coarse
 * anonymized descriptor, never image data.
 */
import type { SpineDatabase } from "./database";
import type { PlaceRow } from "./schema";
import type { SceneDescriptor } from "../position/sceneSignature";

export interface Place {
  readonly id: number;
  readonly name: string;
  readonly descriptor: SceneDescriptor | null;
}

function rowToPlace(row: PlaceRow): Place {
  let descriptor: SceneDescriptor | null = null;
  if (row.descriptor_json) {
    try {
      descriptor = JSON.parse(row.descriptor_json) as SceneDescriptor;
    } catch {
      descriptor = null;
    }
  }
  return { id: row.id, name: row.name, descriptor };
}

export class PlaceRepository {
  constructor(private readonly db: SpineDatabase) {}

  async list(): Promise<Place[]> {
    const rows = await this.db.select<PlaceRow>(
      "SELECT * FROM places ORDER BY id ASC",
    );
    return rows.map(rowToPlace);
  }

  async create(
    name: string,
    descriptor: SceneDescriptor | null,
    now: number,
  ): Promise<Place> {
    const result = await this.db.execute(
      `INSERT INTO places (name, descriptor_json, camera_device_id, created_at, updated_at)
       VALUES (?, ?, NULL, ?, ?)`,
      [name, descriptor ? JSON.stringify(descriptor) : null, now, now],
    );
    return { id: result.lastInsertId ?? 0, name, descriptor };
  }

  async updateDescriptor(
    id: number,
    descriptor: SceneDescriptor,
    now: number,
  ): Promise<void> {
    await this.db.execute(
      "UPDATE places SET descriptor_json = ?, updated_at = ? WHERE id = ?",
      [JSON.stringify(descriptor), now, id],
    );
  }

  async rename(id: number, name: string, now: number): Promise<void> {
    await this.db.execute(
      "UPDATE places SET name = ?, updated_at = ? WHERE id = ?",
      [name, now, id],
    );
  }
}
