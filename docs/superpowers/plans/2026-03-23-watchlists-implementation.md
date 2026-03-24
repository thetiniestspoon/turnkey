# Watchlists + Investment Criteria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add proactive deal discovery — watched markets, investment criteria, nightly autoscout, "New" badges.

**Architecture:** New DB tables (watchlists, investment_criteria), new autoscout Edge Function, pg_cron schedule, frontend watchlist management page + criteria settings.

**Spec:** `docs/superpowers/specs/2026-03-23-watchlists-criteria-design.md`

---

## Task 1: Database Migration

Add watchlists and investment_criteria tables with RLS.

## Task 2: Autoscout Edge Function

New Edge Function that reads watchlists, scouts each, filters against criteria, saves results.

## Task 3: React Hooks

useWatchlists() and useCriteria() hooks.

## Task 4: Watchlists Page + Criteria UI

New /watchlists page with CRUD, criteria form, manual scout trigger.

## Task 5: "New" Badge + Dashboard Updates

Add "New" badges to deal cards and dashboard.

## Task 6: pg_cron Setup + Deploy

Enable extensions, create cron schedule, deploy everything.
