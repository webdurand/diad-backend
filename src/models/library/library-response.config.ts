




interface FlattenConfig {
  as: string;
  pick: string;
}

interface EntityConfig {
  relations?: string[];
  flatten?: Record<string, FlattenConfig>;
}

export const ENTITY_CONFIG: Record<string, EntityConfig> = {
  races: {
    relations: ["race_languages.language", "race_traits.trait", "subraces"],
    flatten: {
      race_languages: { as: "languages", pick: "language" },
      race_traits: { as: "traits", pick: "trait" },
    },
  },
  classes: {
    relations: [
      "class_proficiencies.proficiency",
      "class_saving_throws.ability_score",
      "class_starting_equipment.equipment",
      "subclasses",
    ],
    flatten: {
      class_proficiencies: { as: "proficiencies", pick: "proficiency" },
      class_saving_throws: { as: "saving_throws", pick: "ability_score" },
      class_starting_equipment: {
        as: "starting_equipment",
        pick: "equipment",
      },
    },
  },
  spells: {
    relations: ["school", "spell_classes.class", "spell_subclasses.subclass"],
    flatten: {
      spell_classes: { as: "classes", pick: "class" },
      spell_subclasses: { as: "subclasses", pick: "subclass" },
    },
  },
  backgrounds: {
    relations: ["feat", "background_proficiencies.proficiency"],
    flatten: {
      background_proficiencies: { as: "proficiencies", pick: "proficiency" },
    },
  },
  traits: {
    relations: ["trait_proficiencies.proficiency", "parent"],
    flatten: {
      trait_proficiencies: { as: "proficiencies", pick: "proficiency" },
    },
  },
  levels: {
    relations: ["class", "subclass", "level_features.feature"],
    flatten: {
      level_features: { as: "features", pick: "feature" },
    },
  },
  subraces: {
    relations: ["race", "subrace_traits.trait"],
    flatten: {
      subrace_traits: { as: "racial_traits", pick: "trait" },
    },
  },
  skills: {
    relations: ["ability_score"],
  },
  ability_scores: {
    relations: ["skills"],
  },
  equipments: {
    relations: ["category_items.category"],
    flatten: {
      category_items: { as: "equipment_categories", pick: "category" },
    },
  },
  equipment_categories: {
    relations: ["equipment_items.equipment"],
    flatten: {
      equipment_items: { as: "equipment", pick: "equipment" },
    },
  },
  magic_items: {
    relations: ["equipment_category"],
  },
  features: {
    relations: ["class", "subclass", "parent"],
  },
  subclasses: {
    relations: ["class"],
  },
  comp_sources: {},
};

const INTERNAL_FIELDS = new Set([
  "raw",
  "created_at",
  "updated_at",
  "search_text",
]);

function stripInternal(obj: unknown, depth = 0, entityName = ""): unknown {
  if (!obj || typeof obj !== "object" || depth > 4) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj))
    return obj.map((item) => stripInternal(item, depth, entityName));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (INTERNAL_FIELDS.has(key)) continue;


    if (
      key.endsWith("_id") &&
      key !== "id" &&
      (obj as Record<string, unknown>)[key.replace(/_id$/, "")] !== undefined
    ) {
      continue;
    }

    if (key === "description" && entityName === "spells") {

      continue;
    } else if (value && typeof value === "object" && !(value instanceof Date)) {
      result[key] = stripInternal(value, depth + 1, entityName);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function transformLibraryResponse(
  items: Record<string, unknown>[],
  entityName: string,
): Record<string, unknown>[] {
  const config = ENTITY_CONFIG[entityName];

  return items.map((item) => {

    if (config?.flatten) {
      for (const [junctionField, { as: targetField, pick }] of Object.entries(
        config.flatten,
      )) {
        const junctionArray = item[junctionField];
        if (Array.isArray(junctionArray)) {
          item[targetField] = junctionArray.map(
            (j: Record<string, unknown>) => j[pick],
          );
        }
        delete item[junctionField];
      }
    }

    return stripInternal(item, 0, entityName) as Record<string, unknown>;
  });
}
