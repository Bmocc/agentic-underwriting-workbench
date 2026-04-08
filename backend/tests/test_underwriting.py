import pytest
from app.underwriting import analyze_multifamily
from app.models import UnitItem, MonthlyExpenses


def _quad_units(rent: float = 1200.0) -> list[UnitItem]:
    return [UnitItem(unit_type="2BR", count=4, rent=rent)]


def _base_expenses() -> MonthlyExpenses:
    return MonthlyExpenses(repairs_maintenance=150, capex_reserve=150, electric_common=50)


def _call(**kwargs):
    defaults = dict(
        purchase_price=400_000,
        closing_costs=0,
        initial_repairs=0,
        down_payment_pct=0.25,
        interest_rate_annual=0.07,
        loan_term_years=30,
        vacancy_rate_pct=0.05,
        mgmt_fee_pct_of_egi=0.08,
        taxes_annual=6_000,
        insurance_annual=2_400,
        unit_mix=_quad_units(),
        monthly_expenses=_base_expenses(),
    )
    defaults.update(kwargs)
    return analyze_multifamily(**defaults)


class TestGSRAndEGI:

    def test_gsr_is_sum_of_unit_rents(self):
        # 4 units × $1200 = $4800/month
        result = _call(vacancy_rate_pct=0.0, mgmt_fee_pct_of_egi=0.0,
                       taxes_annual=0, insurance_annual=0,
                       monthly_expenses=MonthlyExpenses())
        assert result.gsr_monthly == pytest.approx(4800.0)

    def test_egi_reduced_by_vacancy(self):
        # EGI = GSR × (1 - vacancy) = 4800 × 0.95 = 4560
        result = _call(vacancy_rate_pct=0.05, mgmt_fee_pct_of_egi=0.0,
                       taxes_annual=0, insurance_annual=0,
                       monthly_expenses=MonthlyExpenses())
        assert result.egi_monthly == pytest.approx(4560.0)

    def test_zero_vacancy_egi_equals_gsr(self):
        result = _call(vacancy_rate_pct=0.0, mgmt_fee_pct_of_egi=0.0,
                       taxes_annual=0, insurance_annual=0,
                       monthly_expenses=MonthlyExpenses())
        assert result.egi_monthly == pytest.approx(result.gsr_monthly)


class TestDSCR:

    def test_dscr_above_one_when_income_covers_debt(self):
        result = _call(purchase_price=200_000, unit_mix=_quad_units(1200))
        assert result.dscr > 1.0

    def test_dscr_below_one_when_income_insufficient(self):
        result = _call(purchase_price=1_500_000,
                       unit_mix=[UnitItem(unit_type="1BR", count=2, rent=600.0)],
                       taxes_annual=15_000, insurance_annual=6_000)
        assert result.dscr < 1.0


class TestCapRateAndGRM:

    def test_cap_rate_formula(self):
        # 0 vacancy, 0 mgmt, 0 expenses → NOI = GSR_annual = 4×1000×12 = 48_000
        # Cap rate = 48_000 / 480_000 = 0.10
        result = _call(
            purchase_price=480_000,
            vacancy_rate_pct=0.0,
            mgmt_fee_pct_of_egi=0.0,
            taxes_annual=0,
            insurance_annual=0,
            unit_mix=[UnitItem(unit_type="1BR", count=4, rent=1000.0)],
            monthly_expenses=MonthlyExpenses(),
        )
        assert result.cap_rate == pytest.approx(0.10, abs=0.001)

    def test_grm_formula(self):
        # GRM = purchase_price / (GSR × 12) = 480_000 / 48_000 = 10
        result = _call(
            purchase_price=480_000,
            vacancy_rate_pct=0.0,
            mgmt_fee_pct_of_egi=0.0,
            taxes_annual=0,
            insurance_annual=0,
            unit_mix=[UnitItem(unit_type="1BR", count=4, rent=1000.0)],
            monthly_expenses=MonthlyExpenses(),
        )
        assert result.grm == pytest.approx(10.0, abs=0.01)


class TestPricePerUnit:

    def test_price_per_unit(self):
        # 400_000 / 4 units = 100_000
        result = _call()
        assert result.price_per_unit == pytest.approx(100_000.0)

    def test_multiple_unit_types_aggregated(self):
        # 2×1BR + 1×2BR = 3 units → price_per_unit = 300_000 / 3 = 100_000
        result = _call(
            purchase_price=300_000,
            unit_mix=[
                UnitItem(unit_type="1BR", count=2, rent=800.0),
                UnitItem(unit_type="2BR", count=1, rent=1200.0),
            ],
        )
        assert result.price_per_unit == pytest.approx(100_000.0)


class TestEdgeCases:

    def test_zero_rent_does_not_crash(self):
        result = _call(unit_mix=[UnitItem(unit_type="X", count=1, rent=0.0)])
        assert result.gsr_monthly == pytest.approx(0.0)
        assert result.grm == pytest.approx(0.0)
        assert result.cap_rate < 0.0  # Negative cap rate when expenses exceed zero income

    def test_returns_all_metric_fields(self):
        result = _call()
        expected_fields = [
            "gsr_monthly", "egi_monthly", "operating_expenses_monthly",
            "noi_annual", "debt_service_annual", "cash_invested",
            "cash_flow_annual", "cash_flow_monthly", "cap_rate",
            "cash_on_cash", "dscr", "breakeven_occupancy",
            "grm", "price_per_unit", "expense_ratio",
        ]
        for field in expected_fields:
            assert hasattr(result, field), f"Missing metric: {field}"
