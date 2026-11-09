from services import reference


def test_scoring_weights_sum_to_one():
    cfg = reference.scoring_config()
    total = sum(c["weight"] for c in cfg["criteria"].values())
    assert abs(total - 1.0) < 1e-9


def test_every_scoring_criterion_points_at_real_keys():
    cfg = reference.scoring_config()
    for key, c in cfg["criteria"].items():
        for region in reference.reference_regions():
            assert c["ref_key"] in region["parameters"], f"{region['id']} lacks {c['ref_key']} for {key}"


def test_every_numeric_reference_value_has_a_source_and_year():
    for region in reference.reference_regions():
        for key, p in region["parameters"].items():
            if p["value"] is not None:
                assert p["source"], f"{region['id']}.{key} has a value without a source"
                assert p["year"], f"{region['id']}.{key} has a value without a year"


def test_missing_reference_values_are_labelled():
    for region in reference.reference_regions():
        for key, p in region["parameters"].items():
            if p["value"] is None:
                assert p["status"], f"{region['id']}.{key} is null without a status"


def test_regions_have_valid_bodies_and_coordinates():
    for region in reference.reference_regions():
        assert region["body"] in ("moon", "mars")
        assert -90 <= region["lat"] <= 90
        assert -180 <= region["lon"] <= 180


def test_catalogue_sites_have_citations_and_valid_coordinates():
    for site in reference.analog_catalogue():
        assert site["citation"].startswith("http")
        assert -90 <= site["lat"] <= 90
        assert -180 <= site["lon"] <= 180


def test_search_region_bboxes_are_ordered():
    for r in reference.search_regions():
        lat_min, lat_max, lon_min, lon_max = r["bbox"]
        assert lat_min < lat_max and lon_min < lon_max, r["id"]


def test_get_region_unknown_raises_key_error():
    import pytest
    with pytest.raises(KeyError):
        reference.get_region("does-not-exist")
