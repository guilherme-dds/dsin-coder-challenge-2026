import { z } from "zod";

export const attributeFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "use camelCase sem espaços"),
  label: z.string().min(1),
  type: z.enum(["text", "number", "boolean", "select"]),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export type AttributeField = z.infer<typeof attributeFieldSchema>;

export const attributesSchemaSchema = z
  .array(attributeFieldSchema)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `chave duplicada: ${field.key}`,
        });
      }
      seen.add(field.key);
      if (field.type === "select" && !field.options?.length) {
        ctx.addIssue({
          code: "custom",
          path: [index, "options"],
          message: "campos select precisam de opções",
        });
      }
    });
  });

export function buildAttributesValidator(fields: AttributeField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let validator: z.ZodTypeAny;
    switch (field.type) {
      case "number":
        validator = z.number();
        break;
      case "boolean":
        validator = z.boolean();
        break;
      case "select":
        validator = z.enum(field.options as [string, ...string[]]);
        break;
      default:
        validator = z.string().min(1);
    }
    shape[field.key] = field.required
      ? validator
      : validator.optional().nullable();
  }

  return z.object(shape).strict();
}
