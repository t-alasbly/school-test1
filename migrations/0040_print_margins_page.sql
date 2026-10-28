-- هوامش المحتوى بعد إضافة هامش الصفحة 5مم تلقائياً
update schools
set print_margins = '{"top":7,"right":7,"bottom":9,"left":5}'::jsonb
where print_margins = '{"top":12,"right":12,"bottom":14,"left":10}'::jsonb
   or print_margins = '{"top":10,"right":10,"bottom":12,"left":8}'::jsonb;
