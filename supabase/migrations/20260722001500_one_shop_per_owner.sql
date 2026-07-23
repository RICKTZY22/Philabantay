-- V1 ownership cardinality: an owner account may own exactly one shop.
--
-- This is a database invariant rather than an Express-only pre-check so two
-- concurrent create requests cannot both succeed. NULL remains available for
-- deliberately unowned catalogue fixtures and any future transfer workflow.
create unique index shops_one_shop_per_owner
  on public.shops (owner_id)
  where owner_id is not null;
