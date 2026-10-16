-- NEXO · paleta de cores escolhida em Configurações > Aparência
-- (o modo claro/escuro continua em profiles.theme)
alter table public.profiles
  add column if not exists palette text not null default 'nexo'
  check (palette in ('nexo', 'violeta', 'laranja', 'ambar', 'turquesa', 'lima'));

notify pgrst, 'reload schema';
