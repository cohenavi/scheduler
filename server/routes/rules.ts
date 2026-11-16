import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { prisma } from '../db.js';

export const rulesRouter = Router();

rulesRouter.use(requireAdmin);

rulesRouter.get('/', async (_req, res) => {
  try {
    const rules = await prisma.constraintRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rules);
  } catch (err) {
    console.error('List rules error:', err);
    res.status(500).json({ error: 'Failed to load constraint rules' });
  }
});

rulesRouter.post('/', async (req, res) => {
  try {
    const { name, ruleType, enforcement, assignmentTypeId, personId, config, isActive, priority } =
      req.body ?? {};
    if (!name || !ruleType) {
      res.status(400).json({ error: 'name and ruleType are required' });
      return;
    }

    const rule = await prisma.constraintRule.create({
      data: {
        name: String(name).trim(),
        ruleType: String(ruleType),
        enforcement: enforcement === 'HARD_BLOCK' ? 'HARD_BLOCK' : 'SOFT_WARN',
        assignmentTypeId: assignmentTypeId || null,
        personId: personId || null,
        config: config ?? {},
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        priority: priority !== undefined ? Number(priority) : 10,
      },
    });
    res.status(201).json(rule);
  } catch (err) {
    console.error('Create rule error:', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

rulesRouter.patch('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { name, ruleType, enforcement, assignmentTypeId, personId, config, isActive, priority } =
      req.body ?? {};

    const rule = await prisma.constraintRule.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(ruleType !== undefined ? { ruleType: String(ruleType) } : {}),
        ...(enforcement !== undefined
          ? { enforcement: enforcement === 'HARD_BLOCK' ? 'HARD_BLOCK' : 'SOFT_WARN' }
          : {}),
        ...(assignmentTypeId !== undefined ? { assignmentTypeId: assignmentTypeId || null } : {}),
        ...(personId !== undefined ? { personId: personId || null } : {}),
        ...(config !== undefined ? { config } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(priority !== undefined ? { priority: Number(priority) } : {}),
      },
    });
    res.json(rule);
  } catch (err) {
    console.error('Update rule error:', err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

rulesRouter.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.constraintRule.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete rule error:', err);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});
