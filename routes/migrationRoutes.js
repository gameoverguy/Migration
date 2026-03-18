import express from "express";
const router = express.Router();
import {
  startMigration,
  getMigrationStatus,
  resetMigration,
} from "../controllers/migrationController.js";

router.post("/start", startMigration);
router.get("/status", getMigrationStatus);
router.post("/reset", resetMigration);

export default router;
