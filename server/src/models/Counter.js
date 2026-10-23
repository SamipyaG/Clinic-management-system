import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: String, // e.g. 'patient:<clinic>:2611', 'token:<doctor>:2026-11-02'
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/** Atomically increment and return the next sequence number (gap-free under concurrency). */
export const nextSeq = async (key) => {
  const doc = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
};
