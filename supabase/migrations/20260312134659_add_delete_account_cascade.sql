ALTER TABLE public.user_paints
    DROP CONSTRAINT user_paints_user_id_fkey,
    ADD CONSTRAINT user_paints_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;;
