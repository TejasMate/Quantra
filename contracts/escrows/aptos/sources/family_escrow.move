module FamilyEscrow::family_escrow {
    use std::signer;
    use std::string::{Self, String};
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};

    /// Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_UNAUTHORIZED: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 5;
    const E_CHILD_ACCOUNT_EXISTS: u64 = 6;
    const E_CHILD_ACCOUNT_NOT_EXISTS: u64 = 7;
    const E_ACCOUNT_NOT_ACTIVE: u64 = 8;
    const E_EXCEEDS_SPENDING_LIMIT: u64 = 9;
    const E_EXCEEDS_MAX_LIMIT: u64 = 10;
    const E_NOT_PARENT: u64 = 11;
    const E_NOT_CHILD: u64 = 12;
    const E_SELF_ACCOUNT: u64 = 13;

    /// Account status
    const ACCOUNT_ACTIVE: u8 = 1;
    const ACCOUNT_FROZEN: u8 = 2;
    const ACCOUNT_SUSPENDED: u8 = 3;

    /// Platform constants
    const MAX_SPENDING_LIMIT: u64 = 1000_00000000; // 1000 APT in octas
    const PLATFORM_FEE_BPS: u64 = 10; // 0.1% in basis points
    const SECONDS_PER_DAY: u64 = 86400;

    /// Child account structure
    struct ChildAccount has store {
        parent: address,
        child: address,
        balance: u64,
        spending_limit: u64, // Daily spending limit in octas
        last_spend_time: u64, // Timestamp of last spending
        daily_spent: u64, // Amount spent today
        status: u8, // Account status
        created_at: u64,
        nickname: String,
        total_spent: u64, // Lifetime spending
        total_received: u64, // Lifetime funding
    }

    /// Transaction record
    struct Transaction has store {
        child: address,
        other_party: address, // Merchant or parent
        amount: u64,
        timestamp: u64,
        description: String,
        is_spending: bool, // true for spending, false for funding
    }

    /// Global family escrow registry
    struct FamilyEscrowRegistry has key {
        child_accounts: Table<address, ChildAccount>,
        parent_children: Table<address, vector<address>>, // parent -> children
        is_child: Table<address, bool>,
        is_parent: Table<address, bool>,
        transactions: Table<u64, Transaction>,
        child_transactions: Table<address, vector<u64>>, // child -> transaction IDs
        transaction_counter: u64,
        total_child_accounts: u64,
        platform_fee_recipient: address,
    }

    /// Events
    struct ChildAccountCreatedEvent has drop, store {
        parent: address,
        child: address,
        spending_limit: u64,
        nickname: String,
    }

    struct AccountFundedEvent has drop, store {
        parent: address,
        child: address,
        amount: u64,
        new_balance: u64,
    }

    struct ChildSpendingEvent has drop, store {
        child: address,
        merchant: address,
        amount: u64,
        remaining_balance: u64,
        description: String,
    }

    struct SpendingLimitUpdatedEvent has drop, store {
        parent: address,
        child: address,
        old_limit: u64,
        new_limit: u64,
    }

    struct AccountStatusChangedEvent has drop, store {
        parent: address,
        child: address,
        old_status: u8,
        new_status: u8,
    }

    struct ParentWithdrawalEvent has drop, store {
        parent: address,
        child: address,
        amount: u64,
        reason: String,
    }

    /// Event handles resource
    struct FamilyEscrowEvents has key {
        child_account_created_events: EventHandle<ChildAccountCreatedEvent>,
        account_funded_events: EventHandle<AccountFundedEvent>,
        child_spending_events: EventHandle<ChildSpendingEvent>,
        spending_limit_updated_events: EventHandle<SpendingLimitUpdatedEvent>,
        account_status_changed_events: EventHandle<AccountStatusChangedEvent>,
        parent_withdrawal_events: EventHandle<ParentWithdrawalEvent>,
    }

    /// Initialize the family escrow system
    public fun initialize(admin: &signer, platform_fee_recipient: address) {
        let admin_addr = signer::address_of(admin);
        
        assert!(!exists<FamilyEscrowRegistry>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(admin, FamilyEscrowRegistry {
            child_accounts: table::new(),
            parent_children: table::new(),
            is_child: table::new(),
            is_parent: table::new(),
            transactions: table::new(),
            child_transactions: table::new(),
            transaction_counter: 0,
            total_child_accounts: 0,
            platform_fee_recipient,
        });

        move_to(admin, FamilyEscrowEvents {
            child_account_created_events: account::new_event_handle<ChildAccountCreatedEvent>(admin),
            account_funded_events: account::new_event_handle<AccountFundedEvent>(admin),
            child_spending_events: account::new_event_handle<ChildSpendingEvent>(admin),
            spending_limit_updated_events: account::new_event_handle<SpendingLimitUpdatedEvent>(admin),
            account_status_changed_events: account::new_event_handle<AccountStatusChangedEvent>(admin),
            parent_withdrawal_events: account::new_event_handle<ParentWithdrawalEvent>(admin),
        });
    }

    /// Create a new child account
    public fun create_child_account(
        parent: &signer,
        child: address,
        spending_limit: u64,
        nickname: String,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let parent_addr = signer::address_of(parent);
        
        assert!(child != parent_addr, E_SELF_ACCOUNT);
        assert!(spending_limit <= MAX_SPENDING_LIMIT, E_EXCEEDS_MAX_LIMIT);
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(!table::contains(&registry.is_child, child), E_CHILD_ACCOUNT_EXISTS);

        // Create child account
        let child_account = ChildAccount {
            parent: parent_addr,
            child,
            balance: 0,
            spending_limit,
            last_spend_time: 0,
            daily_spent: 0,
            status: ACCOUNT_ACTIVE,
            created_at: timestamp::now_seconds(),
            nickname,
            total_spent: 0,
            total_received: 0,
        };

        // Update registry
        table::add(&mut registry.child_accounts, child, child_account);
        table::add(&mut registry.is_child, child, true);
        table::add(&mut registry.is_parent, parent_addr, true);
        
        // Add child to parent's children list
        if (!table::contains(&registry.parent_children, parent_addr)) {
            table::add(&mut registry.parent_children, parent_addr, vector::empty<address>());
        };
        let children = table::borrow_mut(&mut registry.parent_children, parent_addr);
        vector::push_back(children, child);

        // Initialize child transactions list
        table::add(&mut registry.child_transactions, child, vector::empty<u64>());

        registry.total_child_accounts = registry.total_child_accounts + 1;

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.child_account_created_events, ChildAccountCreatedEvent {
            parent: parent_addr,
            child,
            spending_limit,
            nickname,
        });
    }

    /// Fund a child's account
    public fun fund_child_account(
        parent: &signer,
        child: address,
        amount: Coin<AptosCoin>,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let parent_addr = signer::address_of(parent);
        let amount_value = coin::value(&amount);
        
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        assert!(amount_value > 0, E_INVALID_AMOUNT);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow_mut(&mut registry.child_accounts, child);
        assert!(child_account.parent == parent_addr, E_NOT_PARENT);

        // Update child account
        child_account.balance = child_account.balance + amount_value;
        child_account.total_received = child_account.total_received + amount_value;

        // Store the coins (in a real implementation, you'd store them in a resource account)
        coin::destroy_zero(amount); // For demo purposes, we destroy the coin

        // Record transaction
        record_transaction(
            registry,
            child,
            parent_addr,
            amount_value,
            string::utf8(b"Parent funding"),
            false
        );

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.account_funded_events, AccountFundedEvent {
            parent: parent_addr,
            child,
            amount: amount_value,
            new_balance: child_account.balance,
        });
    }

    /// Child spends from their account
    public fun child_spend(
        child: &signer,
        merchant: address,
        amount: u64,
        description: String,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let child_addr = signer::address_of(child);
        
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(table::contains(&registry.child_accounts, child_addr), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow_mut(&mut registry.child_accounts, child_addr);
        assert!(child_account.status == ACCOUNT_ACTIVE, E_ACCOUNT_NOT_ACTIVE);
        assert!(child_account.balance >= amount, E_INSUFFICIENT_BALANCE);

        // Check daily spending limit
        check_daily_limit(child_account, amount);

        // Calculate platform fee
        let fee = (amount * PLATFORM_FEE_BPS) / 10000;
        let merchant_amount = amount - fee;

        // Update account
        child_account.balance = child_account.balance - amount;
        child_account.total_spent = child_account.total_spent + amount;
        update_daily_spending(child_account, amount);

        // In a real implementation, you would transfer coins to merchant and platform
        // For demo purposes, we just update the balances

        // Record transaction
        record_transaction(
            registry,
            child_addr,
            merchant,
            amount,
            description,
            true
        );

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.child_spending_events, ChildSpendingEvent {
            child: child_addr,
            merchant,
            amount,
            remaining_balance: child_account.balance,
            description,
        });
    }

    /// Parent withdraws funds from child's account
    public fun parent_withdraw(
        parent: &signer,
        child: address,
        amount: u64,
        reason: String,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let parent_addr = signer::address_of(parent);
        
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow_mut(&mut registry.child_accounts, child);
        assert!(child_account.parent == parent_addr, E_NOT_PARENT);
        assert!(child_account.balance >= amount, E_INSUFFICIENT_BALANCE);

        child_account.balance = child_account.balance - amount;

        // In a real implementation, you would transfer coins to parent
        // For demo purposes, we just update the balance

        // Record transaction
        record_transaction(
            registry,
            child,
            parent_addr,
            amount,
            reason,
            false
        );

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.parent_withdrawal_events, ParentWithdrawalEvent {
            parent: parent_addr,
            child,
            amount,
            reason,
        });
    }

    /// Set spending limit for child
    public fun set_spending_limit(
        parent: &signer,
        child: address,
        new_limit: u64,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let parent_addr = signer::address_of(parent);
        
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        assert!(new_limit <= MAX_SPENDING_LIMIT, E_EXCEEDS_MAX_LIMIT);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow_mut(&mut registry.child_accounts, child);
        assert!(child_account.parent == parent_addr, E_NOT_PARENT);

        let old_limit = child_account.spending_limit;
        child_account.spending_limit = new_limit;

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.spending_limit_updated_events, SpendingLimitUpdatedEvent {
            parent: parent_addr,
            child,
            old_limit,
            new_limit,
        });
    }

    /// Set account status (freeze/unfreeze)
    public fun set_account_status(
        parent: &signer,
        child: address,
        status: u8,
        registry_addr: address
    ) acquires FamilyEscrowRegistry, FamilyEscrowEvents {
        let parent_addr = signer::address_of(parent);
        
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);

        let registry = borrow_global_mut<FamilyEscrowRegistry>(registry_addr);
        
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow_mut(&mut registry.child_accounts, child);
        assert!(child_account.parent == parent_addr, E_NOT_PARENT);

        let old_status = child_account.status;
        child_account.status = status;

        // Emit event
        let events = borrow_global_mut<FamilyEscrowEvents>(registry_addr);
        event::emit_event(&mut events.account_status_changed_events, AccountStatusChangedEvent {
            parent: parent_addr,
            child,
            old_status,
            new_status: status,
        });
    }

    /// Helper function to check daily spending limit
    fun check_daily_limit(child_account: &ChildAccount, amount: u64) {
        let current_time = timestamp::now_seconds();
        
        // Check if it's a new day
        if (current_time >= child_account.last_spend_time + SECONDS_PER_DAY) {
            // New day, only check if amount exceeds limit
            assert!(amount <= child_account.spending_limit, E_EXCEEDS_SPENDING_LIMIT);
        } else {
            // Same day, check cumulative spending
            assert!(
                child_account.daily_spent + amount <= child_account.spending_limit,
                E_EXCEEDS_SPENDING_LIMIT
            );
        }
    }

    /// Helper function to update daily spending
    fun update_daily_spending(child_account: &mut ChildAccount, amount: u64) {
        let current_time = timestamp::now_seconds();
        
        // Check if it's a new day
        if (current_time >= child_account.last_spend_time + SECONDS_PER_DAY) {
            // New day, reset daily spending
            child_account.daily_spent = amount;
        } else {
            // Same day, add to daily spending
            child_account.daily_spent = child_account.daily_spent + amount;
        };
        
        child_account.last_spend_time = current_time;
    }

    /// Helper function to record a transaction
    fun record_transaction(
        registry: &mut FamilyEscrowRegistry,
        child: address,
        other_party: address,
        amount: u64,
        description: String,
        is_spending: bool
    ) {
        let transaction = Transaction {
            child,
            other_party,
            amount,
            timestamp: timestamp::now_seconds(),
            description,
            is_spending,
        };

        table::add(&mut registry.transactions, registry.transaction_counter, transaction);
        
        let child_txs = table::borrow_mut(&mut registry.child_transactions, child);
        vector::push_back(child_txs, registry.transaction_counter);
        
        registry.transaction_counter = registry.transaction_counter + 1;
    }

    // View functions

    /// Get child account details
    public fun get_child_account(child: address, registry_addr: address): ChildAccount acquires FamilyEscrowRegistry {
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        let registry = borrow_global<FamilyEscrowRegistry>(registry_addr);
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        *table::borrow(&registry.child_accounts, child)
    }

    /// Get remaining daily allowance
    public fun get_remaining_daily_allowance(child: address, registry_addr: address): u64 acquires FamilyEscrowRegistry {
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        let registry = borrow_global<FamilyEscrowRegistry>(registry_addr);
        assert!(table::contains(&registry.child_accounts, child), E_CHILD_ACCOUNT_NOT_EXISTS);
        
        let child_account = table::borrow(&registry.child_accounts, child);
        let current_time = timestamp::now_seconds();
        
        // Check if it's a new day
        if (current_time >= child_account.last_spend_time + SECONDS_PER_DAY) {
            child_account.spending_limit
        } else {
            if (child_account.daily_spent >= child_account.spending_limit) {
                0
            } else {
                child_account.spending_limit - child_account.daily_spent
            }
        }
    }

    /// Check if address is a child
    public fun is_child_account(child: address, registry_addr: address): bool acquires FamilyEscrowRegistry {
        if (!exists<FamilyEscrowRegistry>(registry_addr)) {
            return false
        };
        let registry = borrow_global<FamilyEscrowRegistry>(registry_addr);
        table::contains(&registry.is_child, child) && *table::borrow(&registry.is_child, child)
    }

    /// Check if address is a parent
    public fun is_parent_account(parent: address, registry_addr: address): bool acquires FamilyEscrowRegistry {
        if (!exists<FamilyEscrowRegistry>(registry_addr)) {
            return false
        };
        let registry = borrow_global<FamilyEscrowRegistry>(registry_addr);
        table::contains(&registry.is_parent, parent) && *table::borrow(&registry.is_parent, parent)
    }

    /// Get total number of child accounts
    public fun get_total_child_accounts(registry_addr: address): u64 acquires FamilyEscrowRegistry {
        assert!(exists<FamilyEscrowRegistry>(registry_addr), E_NOT_INITIALIZED);
        let registry = borrow_global<FamilyEscrowRegistry>(registry_addr);
        registry.total_child_accounts
    }
}