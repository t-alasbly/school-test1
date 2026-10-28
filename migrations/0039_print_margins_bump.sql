-- زيادة هوامش الطباعة قليلاً للمدارس التي ما زالت على القيم الافتراضية السابقة
update schools
set print_margins = '{"top":12,"right":12,"bottom":14,"left":10}'::jsonb
where print_margins = '{"top":10,"right":10,"bottom":12,"left":8}'::jsonb
   or print_margins is null;
