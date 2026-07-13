
REVOKE EXECUTE ON FUNCTION public.current_open_register() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.split_order(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_unit(numeric, ingredient_unit, ingredient_unit) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_stock_for_item(uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_open_register() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_order(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.split_order(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_unit(numeric, ingredient_unit, ingredient_unit) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_stock_for_item(uuid, numeric, boolean) TO authenticated, service_role;
