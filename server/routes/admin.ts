import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { prisma } from '../db.js';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// --- People CRUD ---
adminRouter.post('/people', async (req, res) => {
  try {
    const { name, role, maxShiftsPerWeek, maxHoursPerWeek, allowedAssignmentIds } = req.body ?? {};
    if (!name || !role) {
      res.status(400).json({ error: 'Name and role are required' });
      return;
    }

    const maxOrder = await prisma.person.aggregate({ _max: { sortOrder: true } });
    const person = await prisma.person.create({
      data: {
        name: String(name).trim(),
        role: String(role).trim(),
        maxShiftsPerWeek: maxShiftsPerWeek ? Number(maxShiftsPerWeek) : null,
        maxHoursPerWeek: maxHoursPerWeek ? Number(maxHoursPerWeek) : null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        ...(Array.isArray(allowedAssignmentIds)
          ? { allowedAssignments: { connect: allowedAssignmentIds.map((id: string) => ({ id })) } }
          : {}),
      },
      include: { allowedAssignments: { select: { id: true } } },
    });

    res.status(201).json({
      ...person,
      allowedAssignmentIds: person.allowedAssignments.map((a) => a.id),
    });
  } catch (err) {
    console.error('Create person error:', err);
    res.status(500).json({ error: 'Failed to create person' });
  }
});

adminRouter.patch('/people/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { name, role, maxShiftsPerWeek, maxHoursPerWeek, sortOrder, allowedAssignmentIds } = req.body ?? {};

    const person = await prisma.person.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(role !== undefined ? { role: String(role).trim() } : {}),
        ...(maxShiftsPerWeek !== undefined
          ? { maxShiftsPerWeek: maxShiftsPerWeek === null || maxShiftsPerWeek === '' ? null : Number(maxShiftsPerWeek) }
          : {}),
        ...(maxHoursPerWeek !== undefined
          ? { maxHoursPerWeek: maxHoursPerWeek === null || maxHoursPerWeek === '' ? null : Number(maxHoursPerWeek) }
          : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
        ...(Array.isArray(allowedAssignmentIds)
          ? { allowedAssignments: { set: allowedAssignmentIds.map((aid: string) => ({ id: aid })) } }
          : {}),
      },
      include: { allowedAssignments: { select: { id: true } } },
    });

    res.json({
      ...person,
      allowedAssignmentIds: person.allowedAssignments.map((a) => a.id),
    });
  } catch (err) {
    console.error('Update person error:', err);
    res.status(500).json({ error: 'Failed to update person' });
  }
});

adminRouter.delete('/people/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.person.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete person error:', err);
    res.status(500).json({ error: 'Failed to delete person' });
  }
});

adminRouter.post('/people/:id/rotate-calendar-token', async (req, res) => {
  try {
    const id = String(req.params.id);
    const person = await prisma.person.update({
      where: { id },
      data: { calendarToken: crypto.randomUUID() },
      select: { id: true, calendarToken: true },
    });
    res.json(person);
  } catch (err) {
    console.error('Rotate calendar token error:', err);
    res.status(500).json({ error: 'Failed to regenerate calendar token' });
  }
});

// --- Categories CRUD ---
adminRouter.post('/categories', async (req, res) => {
  try {
    const { name } = req.body ?? {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Category name is required' });
      return;
    }
    const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } });
    const category = await prisma.category.create({
      data: {
        name: String(name).trim(),
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    res.status(201).json(category);
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

adminRouter.patch('/categories/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const { name, sortOrder } = req.body ?? {};
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    });
    res.json(category);
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

adminRouter.delete('/categories/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// --- Assignment Types CRUD ---
adminRouter.post('/assignment-types', async (req, res) => {
  try {
    const {
      categoryId,
      name,
      shortCode,
      colorHex,
      allowedDaysOfWeek,
      requiredStaffPerDay,
      timeBlockLabel,
      startTime,
      endTime,
      shortcutKey,
    } = req.body ?? {};

    if (!categoryId || !name || !shortCode || !colorHex) {
      res.status(400).json({ error: 'categoryId, name, shortCode, and colorHex are required' });
      return;
    }

    const maxOrder = await prisma.assignmentType.aggregate({ _max: { sortOrder: true } });
    const assignmentType = await prisma.assignmentType.create({
      data: {
        categoryId,
        name: String(name).trim(),
        shortCode: String(shortCode).trim().toUpperCase().slice(0, 8),
        colorHex: String(colorHex).trim(),
        allowedDaysOfWeek: Array.isArray(allowedDaysOfWeek) ? allowedDaysOfWeek.map(Number) : [0, 1, 2, 3, 4, 5, 6],
        requiredStaffPerDay: requiredStaffPerDay !== undefined ? Number(requiredStaffPerDay) : 1,
        timeBlockLabel: String(timeBlockLabel || 'Full Day'),
        startTime: String(startTime || '08:00'),
        endTime: String(endTime || '17:00'),
        shortcutKey: shortcutKey ? String(shortcutKey).trim().slice(0, 1) : null,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });

    res.status(201).json(assignmentType);
  } catch (err) {
    console.error('Create assignmentType error:', err);
    res.status(500).json({ error: 'Failed to create assignment type (check duplicate shortcut key)' });
  }
});

adminRouter.patch('/assignment-types/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const {
      categoryId,
      name,
      shortCode,
      colorHex,
      allowedDaysOfWeek,
      requiredStaffPerDay,
      timeBlockLabel,
      startTime,
      endTime,
      shortcutKey,
      sortOrder,
    } = req.body ?? {};

    const assignmentType = await prisma.assignmentType.update({
      where: { id },
      data: {
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(shortCode !== undefined ? { shortCode: String(shortCode).trim().toUpperCase().slice(0, 8) } : {}),
        ...(colorHex !== undefined ? { colorHex: String(colorHex).trim() } : {}),
        ...(Array.isArray(allowedDaysOfWeek) ? { allowedDaysOfWeek: allowedDaysOfWeek.map(Number) } : {}),
        ...(requiredStaffPerDay !== undefined ? { requiredStaffPerDay: Number(requiredStaffPerDay) } : {}),
        ...(timeBlockLabel !== undefined ? { timeBlockLabel: String(timeBlockLabel) } : {}),
        ...(startTime !== undefined ? { startTime: String(startTime) } : {}),
        ...(endTime !== undefined ? { endTime: String(endTime) } : {}),
        ...(shortcutKey !== undefined
          ? { shortcutKey: shortcutKey && String(shortcutKey).trim() ? String(shortcutKey).trim().slice(0, 1) : null }
          : {}),
        ...(sortOrder !== undefined ? { sortOrder: Number(sortOrder) } : {}),
      },
    });

    res.json(assignmentType);
  } catch (err) {
    console.error('Update assignmentType error:', err);
    res.status(500).json({ error: 'Failed to update assignment type' });
  }
});

adminRouter.delete('/assignment-types/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.assignmentType.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete assignmentType error:', err);
    res.status(500).json({ error: 'Failed to delete assignment type' });
  }
});
