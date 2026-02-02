// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0


module varuna::option_contract {
  

  use sui::coin;

  public enum OptionType {
    CALL,
    PUT,
  }

  public struct Option has key, store{
    id: UID,
    owner: address,
    option_type: OptionType,
    strike_price: u64,
    expiration_date: u64,
    underlying_asset: coin::Coin<T>,
    underlying_asset_price_at_expiration: u64,
  }

}
