import logging
from sqlmodel import Session, select
from app.core.security import hash_pin
from app.models.listing import ItemListing, Store, StoreMenuItem, User

logger = logging.getLogger("seed")


def seed_initial_data(session: Session) -> None:
    """Seeds realistic multi-store demo data idempotently across 3 partner stores near UI Depok."""
    default_pin_hash = hash_pin("1234")

    # ========================================================================
    # 1. THREE PARTNER STORES (Store)
    # ========================================================================
    existing_stores = session.exec(select(Store)).all()
    store_map: dict[str, Store] = {s.store_id: s for s in existing_stores}

    stores_to_seed = [
        Store(
            store_id="FTUI-001",
            name="Dapur Barokah FTUI",
            pin_hash=default_pin_hash,
            location_name="Kantin FTUI · 110m (🚶 2 mnt)",
            latitude=-6.3621,
            longitude=106.8246,
            closing_time="20:30",
            maps_url="https://maps.google.com/?q=-6.3621,106.8246",
            is_active=True,
        ),
        Store(
            store_id="MARGONDA-042",
            name="Roti Unyil & Pastry Margonda",
            pin_hash=default_pin_hash,
            location_name="Jl. Margonda Raya · 1.8km (🛵 5 mnt)",
            latitude=-6.3685,
            longitude=106.8375,
            closing_time="21:30",
            maps_url="https://maps.google.com/?q=-6.3685,106.8375",
            is_active=True,
        ),
        Store(
            store_id="KUTEK-007",
            name="Warkop & Snack Kutek",
            pin_hash=default_pin_hash,
            location_name="Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)",
            latitude=-6.3575,
            longitude=106.8195,
            closing_time="22:00",
            maps_url="https://maps.google.com/?q=-6.3575,106.8195",
            is_active=True,
        ),
    ]

    for s in stores_to_seed:
        if s.store_id not in store_map:
            session.add(s)
            store_map[s.store_id] = s

    session.commit()

    # ========================================================================
    # 2. STORE MASTER MENU CATALOG (StoreMenuItem - 11 Items)
    # ========================================================================
    existing_menu = session.exec(select(StoreMenuItem)).all()
    if len(existing_menu) < 10:
        menu_items_to_seed = [
            # FTUI-001 (Dapur Barokah FTUI)
            StoreMenuItem(
                store_id="FTUI-001",
                food_name="Rendang Daging Sapi",
                original_price=24000,
                typical_cooking_time="16:00",
                default_hours_cooked=2.0,
                ingredients="Daging sapi, santan kelapa kental, cabai merah, lengkuas",
                canonical_bpom_dish="Rendang Daging Sapi Padang",
                category="HIGH_PERISHABILITY",
                bpom_max_hours=4.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="FTUI-001",
                food_name="Ayam Bakar Madu",
                original_price=22000,
                typical_cooking_time="16:00",
                default_hours_cooked=2.0,
                ingredients="Ayam ungkep, kecap manis, madu, bawang merah",
                canonical_bpom_dish="Ayam Bakar Bumbu Madu",
                category="MEDIUM_PERISHABILITY",
                bpom_max_hours=8.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="FTUI-001",
                food_name="Sayur Lontong Padang",
                original_price=18000,
                typical_cooking_time="16:30",
                default_hours_cooked=1.5,
                ingredients="Lontong, nangka muda, santan encer, buncis",
                canonical_bpom_dish="Lontong Sayur Padang Santan",
                category="HIGH_PERISHABILITY",
                bpom_max_hours=4.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="FTUI-001",
                food_name="Tahu Tempe Bacem Paket",
                original_price=12000,
                typical_cooking_time="15:00",
                default_hours_cooked=2.5,
                ingredients="Tahu kedelai, tempe, gula jawa, ketumbar",
                canonical_bpom_dish="Tahu Tempe Bacem Manis",
                category="MEDIUM_PERISHABILITY",
                bpom_max_hours=8.0,
                is_active=True,
            ),
            # MARGONDA-042 (Roti Unyil & Pastry Margonda)
            StoreMenuItem(
                store_id="MARGONDA-042",
                food_name="Croissant Cokelat Lumer",
                original_price=20000,
                typical_cooking_time="14:00",
                default_hours_cooked=3.0,
                ingredients="Tepung terigu, mentega, cokelat pasta",
                canonical_bpom_dish="Croissant Pastry Cokelat",
                category="LOW_PERISHABILITY",
                bpom_max_hours=24.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="MARGONDA-042",
                food_name="Roti Sobek Keju Artisan",
                original_price=24000,
                typical_cooking_time="13:00",
                default_hours_cooked=4.0,
                ingredients="Tepung terigu, keju cheddar, ragi",
                canonical_bpom_dish="Roti Sobek Manis",
                category="LOW_PERISHABILITY",
                bpom_max_hours=24.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="MARGONDA-042",
                food_name="Donat Gula Klasik Isi 4",
                original_price=16000,
                typical_cooking_time="15:00",
                default_hours_cooked=2.0,
                ingredients="Tepung kentang, gula halus, minyak nabati",
                canonical_bpom_dish="Donat Kentang Gula Halus",
                category="LOW_PERISHABILITY",
                bpom_max_hours=24.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="MARGONDA-042",
                food_name="Danish Pastry Apel Kayu Manis",
                original_price=22000,
                typical_cooking_time="14:00",
                default_hours_cooked=3.0,
                ingredients="Pastry puff, selai apel, kayu manis bubuk",
                canonical_bpom_dish="Danish Pastry Buah",
                category="LOW_PERISHABILITY",
                bpom_max_hours=24.0,
                is_active=True,
            ),
            # KUTEK-007 (Warkop & Snack Kutek)
            StoreMenuItem(
                store_id="KUTEK-007",
                food_name="Mie Goreng Spesial Telur",
                original_price=18000,
                typical_cooking_time="17:00",
                default_hours_cooked=1.5,
                ingredients="Mie telur, sawi, telur mata sapi, bawang goreng",
                canonical_bpom_dish="Mie Goreng Telur Spesial",
                category="MEDIUM_PERISHABILITY",
                bpom_max_hours=8.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="KUTEK-007",
                food_name="Pisang Bakar Cokelat Keju",
                original_price=15000,
                typical_cooking_time="17:30",
                default_hours_cooked=1.0,
                ingredients="Pisang uli, meses cokelat, parutan keju cheddar",
                canonical_bpom_dish="Pisang Bakar Cokelat Keju",
                category="MEDIUM_PERISHABILITY",
                bpom_max_hours=8.0,
                is_active=True,
            ),
            StoreMenuItem(
                store_id="KUTEK-007",
                food_name="Kopi Susu Aren Botol 250ml",
                original_price=18000,
                typical_cooking_time="17:00",
                default_hours_cooked=1.5,
                ingredients="Kopi espresso, susu sapi segar, gula aren cair",
                canonical_bpom_dish="Kopi Susu Gula Aren Botolan",
                category="HIGH_PERISHABILITY",
                bpom_max_hours=4.0,
                is_active=True,
            ),
        ]

        for m in menu_items_to_seed:
            session.add(m)
        session.commit()

    # ========================================================================
    # 3. INITIAL ACTIVE SURPLUS LISTINGS (>= 5 Items with Low-Stock Bundling)
    # ========================================================================
    existing_listings = session.exec(select(ItemListing).where(ItemListing.is_active == True)).all()
    if len(existing_listings) < 4:
        listings_to_seed = [
            # FTUI-001 (Dapur Barokah)
            ItemListing(
                store_id="FTUI-001",
                store_name="Dapur Barokah FTUI",
                location_badge="Kantin FTUI · 110m (🚶 2 mnt)",
                maps_url="https://maps.google.com/?q=-6.3621,106.8246",
                latitude=-6.3621,
                longitude=106.8246,
                closing_time="20:30",
                food_name="Ayam Bakar Madu",
                matched_canonical_dish="Ayam Bakar Bumbu Madu",
                category="MEDIUM_PERISHABILITY",
                quantity=2,  # Low-stock for Mystery Bag bundling demo!
                initial_quantity=4,
                original_price=22000,
                discounted_price=9900,
                discount_percent=55,
                hours_since_cooked=2.0,
                bpom_max_hours=8.0,
                minutes_until_closing=90,
                safety_status="SAFE",
                safety_reason="Waktu simpan (2.0 jam) aman dari batas maksimal BPOM (8.0 jam).",
                hazard_description="Olahan unggas matang aman pada suhu ruang dalam batas toleransi.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 08.0",
                similarity_score=0.96,
                is_bundle=False,
                is_active=True,
            ),
            ItemListing(
                store_id="FTUI-001",
                store_name="Dapur Barokah FTUI",
                location_badge="Kantin FTUI · 110m (🚶 2 mnt)",
                maps_url="https://maps.google.com/?q=-6.3621,106.8246",
                latitude=-6.3621,
                longitude=106.8246,
                closing_time="20:30",
                food_name="Tahu Tempe Bacem Paket",
                matched_canonical_dish="Tahu Tempe Bacem Manis",
                category="MEDIUM_PERISHABILITY",
                quantity=1,  # Low-stock for Mystery Bag bundling demo!
                initial_quantity=3,
                original_price=12000,
                discounted_price=6000,
                discount_percent=50,
                hours_since_cooked=2.5,
                bpom_max_hours=8.0,
                minutes_until_closing=90,
                safety_status="SAFE",
                safety_reason="Waktu simpan (2.5 jam) aman dari batas maksimal BPOM (8.0 jam).",
                hazard_description="Olahan kedelai manis memiliki stabilitas mikrobiologis baik.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 06.0",
                similarity_score=0.95,
                is_bundle=False,
                is_active=True,
            ),
            # MARGONDA-042 (Roti Unyil & Pastry Margonda)
            ItemListing(
                store_id="MARGONDA-042",
                store_name="Roti Unyil & Pastry Margonda",
                location_badge="Jl. Margonda Raya · 1.8km (🛵 5 mnt)",
                maps_url="https://maps.google.com/?q=-6.3685,106.8375",
                latitude=-6.3685,
                longitude=106.8375,
                closing_time="21:30",
                food_name="Croissant Cokelat Lumer",
                matched_canonical_dish="Croissant Pastry Cokelat",
                category="LOW_PERISHABILITY",
                quantity=2,  # Low stock
                initial_quantity=5,
                original_price=20000,
                discounted_price=9000,
                discount_percent=55,
                hours_since_cooked=3.0,
                bpom_max_hours=24.0,
                minutes_until_closing=120,
                safety_status="SAFE",
                safety_reason="Produk bakery berkadar air rendah aman hingga 24.0 jam.",
                hazard_description="Produk bakery aman pada suhu ruang.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 07.0",
                similarity_score=0.97,
                is_bundle=False,
                is_active=True,
            ),
            ItemListing(
                store_id="MARGONDA-042",
                store_name="Roti Unyil & Pastry Margonda",
                location_badge="Jl. Margonda Raya · 1.8km (🛵 5 mnt)",
                maps_url="https://maps.google.com/?q=-6.3685,106.8375",
                latitude=-6.3685,
                longitude=106.8375,
                closing_time="21:30",
                food_name="Donat Gula Klasik Isi 4",
                matched_canonical_dish="Donat Kentang Gula Halus",
                category="LOW_PERISHABILITY",
                quantity=1,  # Low stock
                initial_quantity=3,
                original_price=16000,
                discounted_price=6400,
                discount_percent=60,
                hours_since_cooked=2.0,
                bpom_max_hours=24.0,
                minutes_until_closing=120,
                safety_status="SAFE",
                safety_reason="Produk donat goreng aman pada suhu ruang.",
                hazard_description="Produk bakery berkadar air rendah aman.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 07.0",
                similarity_score=0.96,
                is_bundle=False,
                is_active=True,
            ),
            # KUTEK-007 (Warkop & Snack Kutek)
            ItemListing(
                store_id="KUTEK-007",
                store_name="Warkop & Snack Kutek",
                location_badge="Kukusan Teknik (Kutek) · 780m (🚶 9 mnt)",
                maps_url="https://maps.google.com/?q=-6.3575,106.8195",
                latitude=-6.3575,
                longitude=106.8195,
                closing_time="22:00",
                food_name="Pisang Bakar Cokelat Keju",
                matched_canonical_dish="Pisang Bakar Cokelat Keju",
                category="MEDIUM_PERISHABILITY",
                quantity=4,
                initial_quantity=6,
                original_price=15000,
                discounted_price=7500,
                discount_percent=50,
                hours_since_cooked=1.0,
                bpom_max_hours=8.0,
                minutes_until_closing=150,
                safety_status="SAFE",
                safety_reason="Pisang olahan aman dalam batas 8.0 jam.",
                hazard_description="Cemilan matang stabil pada suhu ruang.",
                regulation_ref="PerBPOM No. 16/2019 Kategori Pangan 04.0",
                similarity_score=0.95,
                is_bundle=False,
                is_active=True,
            ),
        ]

        for item in listings_to_seed:
            session.add(item)
        session.commit()

    # ========================================================================
    # 4. DEFAULT CONSUMER USER (User)
    # ========================================================================
    budi_user = session.exec(select(User).where(User.phone == "0812-8899-0011")).first()
    if not budi_user:
        budi_user = User(name="Budi Santoso", phone="0812-8899-0011", role="CONSUMER")
        session.add(budi_user)
        session.commit()

