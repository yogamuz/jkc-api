// src/config/schemaOptions.js
const baseSchemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform(doc, ret) {
      delete ret._id;
      delete ret.__v;
    },
  },
};

module.exports = baseSchemaOptions;