//! Pure checked commercial accounting; provider publication validates these terms.
use crate::{hashing, model::*};

/// None means unbounded/unknown, never zero. Err means inconsistent canonical terms.
pub fn total_commitment(quote: &QuoteInput) -> Result<Option<u128>, &'static str> {
    let Some(terms) = &quote.commercial_terms else {
        return Ok(if quote.recurring {
            None
        } else {
            Some(quote.price.0)
        });
    };
    if !(1..=120).contains(&terms.required_periods)
        || hashing::decode_hash(&terms.cancellation_terms_hash).is_none()
        || hashing::decode_hash(&terms.source_evidence_hash).is_none()
    {
        return Err("INVALID_COMMERCIAL_TERMS");
    }
    let upfront = terms
        .mandatory_fees
        .0
        .checked_add(terms.known_taxes.0)
        .and_then(|n| n.checked_add(terms.setup_fees.0))
        .ok_or("COMMITMENT_OVERFLOW")?;
    if terms.billing_model == BillingModel::UnknownExposure {
        return Ok(None);
    }
    let recurring = terms.billing_model == BillingModel::FixedRecurring;
    if quote.recurring != recurring
        || terms.period_charge.0 == 0
        || recurring && terms.cadence == BillingCadence::Once
        || !recurring && (terms.cadence != BillingCadence::Once || terms.required_periods != 1)
        || terms.period_charge.0.checked_add(upfront) != Some(quote.price.0)
    {
        return Err("COMMERCIAL_AMOUNT_MISMATCH");
    }
    let total = terms
        .period_charge
        .0
        .checked_mul(u128::from(terms.required_periods))
        .and_then(|n| n.checked_add(upfront))
        .ok_or("COMMITMENT_OVERFLOW")?;
    if terms.auto_renew || !terms.future_obligation_contingent_on_initial_payment {
        return Ok(None);
    }
    Ok(Some(total))
}
