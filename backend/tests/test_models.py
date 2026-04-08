import pytest
from pydantic import ValidationError
from app.models import ListingPayload, PipelineRunRequest


class TestListingPayload:

    def test_valid_minimal_listing(self):
        listing = ListingPayload(zpid="12345", price=300_000)
        assert listing.zpid == "12345"
        assert listing.price == 300_000.0

    def test_extra_zillow_fields_pass_through(self):
        # extra="allow" so unknown Zillow fields should be preserved
        listing = ListingPayload(zpid="12345", price=300_000, imgSrc="http://example.com/img.jpg")
        assert listing.model_extra.get("imgSrc") == "http://example.com/img.jpg"

    def test_empty_listing_is_valid(self):
        listing = ListingPayload()
        assert listing.zpid is None

    def test_invalid_price_type_raises(self):
        with pytest.raises(ValidationError):
            ListingPayload(price="not-a-number")

    def test_pipeline_request_accepts_listing_dicts(self):
        req = PipelineRunRequest(listings=[{"zpid": "123", "price": 250_000}])
        assert len(req.listings) == 1
        assert req.listings[0].zpid == "123"
        assert req.listings[0].price == 250_000.0
