-- Page selection: which pages of a file to print, canonical text like '1-3,5,8-10'.
-- null = every page. page_count stays the number of pages IN the file; prices use the selected pages.
alter table public.order_files add column if not exists page_range text;
