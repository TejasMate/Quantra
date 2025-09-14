module MerchantEscrow::escrow {
    use std::signer;
    use std::string::{Self, String};
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};

    /// Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_UNAUTHORIZED: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 5;
    const E_DISPUTE_PERIOD_ACTIVE: u64 = 6;
    const E_ESCROW_NOT_ACTIVE: u64 = 7;
    const E_ESCROW_NOT_EMPTY: u64 = 8;
    const E_ESCROW_ACCOUNT_EXISTS: u64 = 9;

    /// Escrow account structure
    struct Escrow<phantom CoinType> has key {
        merchant: address,
        balance: u64,
        dispute_period: u64, // in seconds
        collateral_amount: u64,
        is_active: bool,
        created_at: u64,
        last_activity: u64,
        upi_id: String,
    }

    /// Global escrow registry
    struct EscrowRegistry has key {
        escrows: Table<address, bool>, // merchant -> has_escrow
        upi_escrows: Table<String, address>, // upi_id -> escrow_account_address
        total_escrows: u64,
    }

    /// Resource to track escrow accounts created by funding wallet
    struct EscrowAccountRegistry has key {
        created_accounts: Table<String, address>, // upi_id -> escrow_account_address
        total_accounts: u64,
    }

    /// Resource to store escrow signer capability
    struct EscrowSignerCapability has key {
        cap: account::SignerCapability,
    }

    // Events
    #[event]
    struct EscrowAccountCreated has drop, store {
        upi_id: String,
        escrow_account: address,
        merchant_owner: address,
        funding_wallet: address,
        timestamp: u64,
    }

    #[event]
    struct DepositEvent has drop, store {
        merchant: address,
        user: address,
        amount: u64,
        new_balance: u64,
        timestamp: u64,
    }

    #[event]
    struct WithdrawEvent has drop, store {
        merchant: address,
        amount: u64,
        remaining_balance: u64,
        timestamp: u64,
    }

    #[event]
    struct EscrowCreatedEvent has drop, store {
        merchant: address,
        collateral_amount: u64,
        dispute_period: u64,
        timestamp: u64,
    }

    /// Initialize the escrow registry (called once)
    public entry fun initialize_registry_entry(admin: &signer) {
        initialize_registry(admin);
    }

    /// Initialize the escrow registry (called once)
    public fun initialize_registry(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<EscrowRegistry>(admin_addr), E_ALREADY_INITIALIZED);
        
        move_to(admin, EscrowRegistry {
            escrows: table::new(),
            upi_escrows: table::new(),
            total_escrows: 0,
        });

        // Also initialize escrow account registry
        move_to(admin, EscrowAccountRegistry {
            created_accounts: table::new(),
            total_accounts: 0,
        });
    }

    /// Create a new escrow account for a specific UPI ID owned by funding wallet
    public entry fun create_escrow_account_for_upi_entry<CoinType>(
        funding_wallet: &signer,
        merchant_owner: address,
        upi_id: String,
        collateral_amount: u64,
        dispute_period: u64,
    ) acquires EscrowRegistry, EscrowAccountRegistry {
        create_escrow_account_for_upi<CoinType>(
            funding_wallet,
            merchant_owner, 
            upi_id,
            collateral_amount,
            dispute_period
        );
    }

    /// Create a new escrow account for a specific UPI ID owned by funding wallet
    public fun create_escrow_account_for_upi<CoinType>(
        funding_wallet: &signer,
        merchant_owner: address,
        upi_id: String,
        collateral_amount: u64,
        dispute_period: u64,
    ): address acquires EscrowRegistry, EscrowAccountRegistry {
        let funding_addr = signer::address_of(funding_wallet);
        
        // Check if UPI already has an escrow account
        let registry = borrow_global<EscrowRegistry>(@MerchantEscrow);
        assert!(!table::contains(&registry.upi_escrows, upi_id), E_ESCROW_ACCOUNT_EXISTS);
        
        // Create a new account for this escrow using UPI ID as seed
        let (escrow_signer, escrow_signer_cap) = account::create_resource_account(
            funding_wallet, 
            *string::bytes(&upi_id)
        );
        let escrow_account_addr = signer::address_of(&escrow_signer);
        
        // Initialize coin store for escrow account
        if (!coin::is_account_registered<CoinType>(escrow_account_addr)) {
            coin::register<CoinType>(&escrow_signer);
        };
        
        // Transfer collateral to escrow account if needed
        if (collateral_amount > 0) {
            let collateral = coin::withdraw<CoinType>(funding_wallet, collateral_amount);
            coin::deposit(escrow_account_addr, collateral);
        };
        
        // Create escrow resource at the new account
        let escrow = Escrow<CoinType> {
            merchant: merchant_owner,
            balance: collateral_amount,
            dispute_period,
            collateral_amount,
            is_active: true,
            created_at: timestamp::now_seconds(),
            last_activity: timestamp::now_seconds(),
            upi_id,
        };
        
        move_to(&escrow_signer, escrow);
        
        // Store the signer capability (for future operations)
        move_to(&escrow_signer, EscrowSignerCapability {
            cap: escrow_signer_cap,
        });
        
        // Update registries
        let registry_mut = borrow_global_mut<EscrowRegistry>(@MerchantEscrow);
        table::add(&mut registry_mut.upi_escrows, upi_id, escrow_account_addr);
        table::add(&mut registry_mut.escrows, escrow_account_addr, true);
        registry_mut.total_escrows = registry_mut.total_escrows + 1;
        
        let account_registry_mut = borrow_global_mut<EscrowAccountRegistry>(@MerchantEscrow);
        table::add(&mut account_registry_mut.created_accounts, upi_id, escrow_account_addr);
        account_registry_mut.total_accounts = account_registry_mut.total_accounts + 1;
        
        // Emit event
        event::emit(EscrowAccountCreated {
            upi_id,
            escrow_account: escrow_account_addr,
            merchant_owner,
            funding_wallet: funding_addr,
            timestamp: timestamp::now_seconds(),
        });

        escrow_account_addr
    }

    /// Get escrow account address by UPI ID
    public fun get_escrow_account_by_upi(upi_id: String): address acquires EscrowRegistry {
        let registry = borrow_global<EscrowRegistry>(@MerchantEscrow);
        *table::borrow(&registry.upi_escrows, upi_id)
    }

    /// Get escrow account address by UPI ID (view function)
    #[view]
    public fun get_escrow_account_by_upi_view(upi_id: String): address acquires EscrowRegistry {
        assert!(exists<EscrowRegistry>(@MerchantEscrow), E_NOT_INITIALIZED);
        let registry = borrow_global<EscrowRegistry>(@MerchantEscrow);
        *table::borrow(&registry.upi_escrows, upi_id)
    }

    /// Create a new escrow account for a merchant
    public entry fun create_escrow_entry<CoinType>(
        merchant: &signer,
        collateral_amount: u64,
        dispute_period: u64,
    ) acquires EscrowRegistry {
        create_escrow<CoinType>(merchant, collateral_amount, dispute_period);
    }

    /// Create a new escrow account for a merchant
    public fun create_escrow<CoinType>(
        merchant: &signer,
        collateral_amount: u64,
        dispute_period: u64,
    ) acquires EscrowRegistry {
        let merchant_addr = signer::address_of(merchant);
        assert!(!exists<Escrow<CoinType>>(merchant_addr), E_ALREADY_INITIALIZED);
        assert!(collateral_amount > 0, E_INVALID_AMOUNT);
        
        // Transfer collateral from merchant
        let collateral = coin::withdraw<CoinType>(merchant, collateral_amount);
        coin::deposit(merchant_addr, collateral);
        
        // Create escrow
        let escrow = Escrow<CoinType> {
            merchant: merchant_addr,
            balance: 0,
            dispute_period,
            collateral_amount,
            is_active: true,
            created_at: timestamp::now_seconds(),
            last_activity: timestamp::now_seconds(),
            upi_id: string::utf8(b"default"),
        };
        
        move_to(merchant, escrow);
        
        // Update registry
        let registry = borrow_global_mut<EscrowRegistry>(@MerchantEscrow);
        table::add(&mut registry.escrows, merchant_addr, true);
        registry.total_escrows = registry.total_escrows + 1;
        
        // Emit event
        event::emit(EscrowCreatedEvent {
            merchant: merchant_addr,
            collateral_amount,
            dispute_period,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Deposit funds to merchant's escrow
    public fun deposit<CoinType>(
        user: &signer,
        merchant_addr: address,
        amount: u64,
    ) acquires Escrow {
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(merchant_addr);
        assert!(escrow.is_active, E_ESCROW_NOT_ACTIVE);
        
        // Transfer coins from user to escrow
        let coins = coin::withdraw<CoinType>(user, amount);
        coin::deposit(merchant_addr, coins);
        
        // Update escrow balance
        escrow.balance = escrow.balance + amount;
        escrow.last_activity = timestamp::now_seconds();
        
        // Emit event
        event::emit(DepositEvent {
            merchant: merchant_addr,
            user: signer::address_of(user),
            amount,
            new_balance: escrow.balance,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Withdraw funds from escrow (merchant only)
    public fun withdraw<CoinType>(
        merchant: &signer,
        amount: u64,
    ) acquires Escrow {
        let merchant_addr = signer::address_of(merchant);
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(merchant_addr);
        assert!(escrow.is_active, E_ESCROW_NOT_ACTIVE);
        assert!(escrow.balance >= amount, E_INSUFFICIENT_BALANCE);
        
        // Check if dispute period has passed
        let current_time = timestamp::now_seconds();
        assert!(
            current_time >= escrow.last_activity + escrow.dispute_period,
            E_DISPUTE_PERIOD_ACTIVE
        );
        
        // Transfer coins to merchant
        let coins = coin::withdraw<CoinType>(merchant, amount);
        coin::deposit(merchant_addr, coins);
        
        // Update escrow balance
        escrow.balance = escrow.balance - amount;
        escrow.last_activity = current_time;
        
        // Emit event
        event::emit(WithdrawEvent {
            merchant: merchant_addr,
            amount,
            remaining_balance: escrow.balance,
            timestamp: current_time,
        });
    }

    // Get escrow balance
    #[view]
    public fun get_balance<CoinType>(merchant_addr: address): u64 acquires Escrow {
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        let escrow = borrow_global<Escrow<CoinType>>(merchant_addr);
        escrow.balance
    }

    // Get escrow info
    #[view]
    public fun get_escrow_info<CoinType>(merchant_addr: address): (u64, u64, u64, bool, u64, u64) acquires Escrow {
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        let escrow = borrow_global<Escrow<CoinType>>(merchant_addr);
        (
            escrow.balance,
            escrow.dispute_period,
            escrow.collateral_amount,
            escrow.is_active,
            escrow.created_at,
            escrow.last_activity
        )
    }

    // Check if merchant has escrow
    #[view]
    public fun has_escrow(merchant_addr: address): bool acquires EscrowRegistry {
        if (!exists<EscrowRegistry>(@MerchantEscrow)) {
            return false
        };
        let registry = borrow_global<EscrowRegistry>(@MerchantEscrow);
        table::contains(&registry.escrows, merchant_addr)
    }

    // Get total number of escrows
    #[view]
    public fun get_total_escrows(): u64 acquires EscrowRegistry {
        assert!(exists<EscrowRegistry>(@MerchantEscrow), E_NOT_INITIALIZED);
        let registry = borrow_global<EscrowRegistry>(@MerchantEscrow);
        registry.total_escrows
    }

    /// Deactivate escrow (admin only)
    public fun deactivate_escrow<CoinType>(
        admin: &signer,
        merchant_addr: address,
    ) acquires Escrow {
        // Only admin can deactivate
        assert!(signer::address_of(admin) == @MerchantEscrow, E_UNAUTHORIZED);
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(merchant_addr);
        escrow.is_active = false;
    }

    /// Emergency withdraw (admin only)
    public fun emergency_withdraw<CoinType>(
        admin: &signer,
        merchant_addr: address,
        amount: u64,
    ) acquires Escrow {
        // Only admin can emergency withdraw
        assert!(signer::address_of(admin) == @MerchantEscrow, E_UNAUTHORIZED);
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(merchant_addr);
        assert!(escrow.balance >= amount, E_INSUFFICIENT_BALANCE);
        
        // Transfer coins to admin
        let coins = coin::withdraw<CoinType>(admin, amount);
        coin::deposit(signer::address_of(admin), coins);
        
        // Update escrow balance
        escrow.balance = escrow.balance - amount;
        escrow.last_activity = timestamp::now_seconds();
    }

    /// Close escrow (merchant only, must be empty)
    public fun close_escrow<CoinType>(
        merchant: &signer,
    ) acquires Escrow, EscrowRegistry {
        let merchant_addr = signer::address_of(merchant);
        assert!(exists<Escrow<CoinType>>(merchant_addr), E_NOT_INITIALIZED);
        
        let escrow = borrow_global<Escrow<CoinType>>(merchant_addr);
        assert!(escrow.balance == 0, E_ESCROW_NOT_EMPTY);
        
        // Return collateral to merchant
        let collateral = coin::withdraw<CoinType>(merchant, escrow.collateral_amount);
        coin::deposit(merchant_addr, collateral);
        
        // Remove escrow
        let Escrow {
            merchant: _,
            balance: _,
            dispute_period: _,
            collateral_amount: _,
            is_active: _,
            created_at: _,
            last_activity: _,
            upi_id: _,
        } = move_from<Escrow<CoinType>>(merchant_addr);
        
        // Update registry
        let registry = borrow_global_mut<EscrowRegistry>(@MerchantEscrow);
        table::remove(&mut registry.escrows, merchant_addr);
        registry.total_escrows = registry.total_escrows - 1;
    }

    #[test_only]
    use aptos_framework::aptos_coin::AptosCoin;
    
    #[test(admin = @MerchantEscrow, merchant = @0x123, user = @0x456)]
    public fun test_create_and_deposit(
        admin: &signer,
        merchant: &signer,
        user: &signer,
    ) acquires EscrowRegistry, Escrow {
        // Initialize registry
        initialize_registry(admin);
        
        // Create escrow
        create_escrow<AptosCoin>(merchant, 1000, 3600); // 1 hour dispute period
        
        // Deposit funds
        deposit<AptosCoin>(user, signer::address_of(merchant), 500);
        
        // Check balance
        let balance = get_balance<AptosCoin>(signer::address_of(merchant));
        assert!(balance == 500, 1);
    }
}