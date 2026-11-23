-- VUELO DRIVER V2 - SQL REVISADO

-- Campos base
alter table profiles add column if not exists phone text;
alter table profiles add column if not exists is_active boolean default true;
alter table profiles add column if not exists rating numeric(3,2) default 5.00;
alter table profiles add column if not exists city text default 'Ometepe';
alter table profiles add column if not exists vuelo_id text unique;

-- Tabla de conductores aprobados
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  vehicle_type text check (vehicle_type in ('car','motorcycle')),
  vehicle_brand text,
  vehicle_model text,
  vehicle_color text,
  plate_number text,
  availability_status text default 'offline',
  is_verified boolean default false,
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

-- Ubicación del conductor
create table if not exists driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references drivers(id) on delete cascade,
  ride_id uuid references rides(id) on delete set null,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  created_at timestamptz default now()
);

-- Mensajes internos de viaje
create table if not exists ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references rides(id) on delete cascade,
  sender_profile_id uuid references profiles(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

-- Push subscriptions para próximas versiones
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  role text,
  endpoint text not null,
  p256dh text,
  auth text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Ofertas: tiempo estimado
alter table ride_offers add column if not exists estimated_arrival_minutes int;

-- Activar RLS
alter table drivers enable row level security;
alter table driver_locations enable row level security;
alter table ride_messages enable row level security;
alter table push_subscriptions enable row level security;
alter table rides enable row level security;
alter table ride_offers enable row level security;

-- DRIVERS
drop policy if exists "Drivers can read own driver profile" on drivers;
create policy "Drivers can read own driver profile" on drivers
for select to authenticated
using (
  profile_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations','support'))
);

drop policy if exists "Drivers can update own availability" on drivers;
create policy "Drivers can update own availability" on drivers
for update to authenticated
using (
  profile_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
)
with check (
  profile_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
);

drop policy if exists "Admins can insert drivers" on drivers;
create policy "Admins can insert drivers" on drivers
for insert to authenticated
with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
);

-- RIDES
drop policy if exists "Drivers can see searching rides" on rides;
create policy "Drivers can see searching rides" on rides
for select to authenticated
using (
  status = 'searching'
  and exists (
    select 1 from profiles 
    where id = auth.uid()
    and role in ('driver','super_admin','admin','operations')
    and is_active = true
  )
);

drop policy if exists "Drivers can see assigned rides" on rides;
create policy "Drivers can see assigned rides" on rides
for select to authenticated
using (
  exists (
    select 1 from drivers
    where drivers.profile_id = auth.uid()
    and rides.driver_id = drivers.id
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations','support'))
);

drop policy if exists "Drivers can update assigned rides" on rides;
create policy "Drivers can update assigned rides" on rides
for update to authenticated
using (
  exists (
    select 1 from drivers
    where drivers.profile_id = auth.uid()
    and rides.driver_id = drivers.id
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
)
with check (
  exists (
    select 1 from drivers
    where drivers.profile_id = auth.uid()
    and rides.driver_id = drivers.id
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
);

-- RIDE OFFERS
drop policy if exists "Drivers can create offers" on ride_offers;
create policy "Drivers can create offers" on ride_offers
for insert to authenticated
with check (
  exists (
    select 1 from drivers
    join profiles on profiles.id = drivers.profile_id
    where drivers.id = ride_offers.driver_id
    and drivers.profile_id = auth.uid()
    and profiles.role = 'driver'
    and profiles.is_active = true
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
);

drop policy if exists "Drivers can read own offers" on ride_offers;
create policy "Drivers can read own offers" on ride_offers
for select to authenticated
using (
  exists (
    select 1 from drivers
    where drivers.profile_id = auth.uid()
    and ride_offers.driver_id = drivers.id
  )
  or exists (
    select 1 from rides
    where rides.id = ride_offers.ride_id
    and rides.passenger_id = auth.uid()
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations','support'))
);

-- DRIVER LOCATIONS
drop policy if exists "Drivers can insert own locations" on driver_locations;
create policy "Drivers can insert own locations" on driver_locations
for insert to authenticated
with check (
  exists (
    select 1 from drivers
    where drivers.id = driver_locations.driver_id
    and drivers.profile_id = auth.uid()
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations'))
);

drop policy if exists "Users can read relevant driver locations" on driver_locations;
create policy "Users can read relevant driver locations" on driver_locations
for select to authenticated
using (
  exists (
    select 1 from drivers
    where drivers.id = driver_locations.driver_id
    and drivers.profile_id = auth.uid()
  )
  or exists (
    select 1 from rides
    where rides.id = driver_locations.ride_id
    and rides.passenger_id = auth.uid()
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations','support'))
);

-- RIDE MESSAGES
drop policy if exists "Users can create ride messages" on ride_messages;
create policy "Users can create ride messages" on ride_messages
for insert to authenticated
with check (sender_profile_id = auth.uid());

drop policy if exists "Users can read relevant ride messages" on ride_messages;
create policy "Users can read relevant ride messages" on ride_messages
for select to authenticated
using (
  sender_profile_id = auth.uid()
  or exists (
    select 1 from rides
    where rides.id = ride_messages.ride_id
    and rides.passenger_id = auth.uid()
  )
  or exists (
    select 1 from rides
    join drivers on drivers.id = rides.driver_id
    where rides.id = ride_messages.ride_id
    and drivers.profile_id = auth.uid()
  )
  or exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin','operations','support'))
);
