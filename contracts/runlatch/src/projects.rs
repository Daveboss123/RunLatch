//! Bounded project authority. No client text, extra payment rail or funding ledger.
use crate::{RunLatch, RunLatchExt, hashing, model::*};
use near_sdk::{
    env,
    json_types::{U64, U128},
    near, require,
};

#[near]
impl RunLatch {
    #[payable]
    pub fn create_project(&mut self, project: ProjectInput) -> Project {
        self.assert_operator();
        Self::assert_id(&project.project_id);
        Self::assert_id(&project.organisation_id);
        Self::assert_id(&project.client_ref);
        require!(
            !self.projects.contains_key(&project.project_id),
            "PROJECT_ALREADY_EXISTS"
        );
        require!(self.project_ids.len() < MAX_PROJECTS, "PROJECT_LIMIT");
        require!(project.budget_ceiling.0 > 0, "INVALID_PROJECT_BUDGET");
        require!(
            project.expires_at_ns.0 > env::block_timestamp(),
            "PROJECT_EXPIRED"
        );
        require!(
            hashing::decode_hash(&project.outcome_definition_hash).is_some(),
            "INVALID_OUTCOME_DEFINITION_HASH"
        );
        require!(
            env::attached_deposit().as_yoctonear() == Self::storage_price(PROJECT_STORAGE_BYTES),
            "PROJECT_STORAGE_DEPOSIT_MISMATCH"
        );
        let now = U64(env::block_timestamp());
        let record = Project {
            input: project,
            owner_id: self.operator_id.clone(),
            revision: U64(1),
            status: ProjectStatus::Active,
            allocated_authority: U128(0),
            capsule_ids: Vec::new(),
            created_at_ns: now,
            updated_at_ns: now,
        };
        self.project_ids.push(record.input.project_id.clone());
        self.projects
            .insert(record.input.project_id.clone(), record.clone());
        Self::emit_project(&record);
        record
    }

    #[payable]
    pub fn set_project_status(
        &mut self,
        project_id: String,
        expected_revision: U64,
        status: ProjectStatus,
    ) -> Project {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&project_id);
        let record = self.projects.get_mut(&project_id).expect("UNKNOWN_PROJECT");
        require!(
            record.revision == expected_revision,
            "PROJECT_REVISION_CONFLICT"
        );
        if record.status == status {
            return record.clone();
        }
        require!(
            matches!(record.status, ProjectStatus::Active | ProjectStatus::Paused),
            "PROJECT_TERMINAL"
        );
        record.revision = U64(record
            .revision
            .0
            .checked_add(1)
            .expect("PROJECT_REVISION_OVERFLOW"));
        record.status = status;
        record.updated_at_ns = U64(env::block_timestamp());
        let record = record.clone();
        Self::emit_project(&record);
        record
    }

    /// Invalidates existing mandates without editing their immutable policies.
    #[payable]
    pub fn advance_project_revision(
        &mut self,
        project_id: String,
        expected_revision: U64,
    ) -> Project {
        self.assert_operator();
        Self::assert_one_yocto();
        Self::assert_id(&project_id);
        let record = self.projects.get_mut(&project_id).expect("UNKNOWN_PROJECT");
        require!(
            record.revision == expected_revision,
            "PROJECT_REVISION_CONFLICT"
        );
        require!(
            matches!(record.status, ProjectStatus::Active | ProjectStatus::Paused),
            "PROJECT_TERMINAL"
        );
        record.revision = U64(record
            .revision
            .0
            .checked_add(1)
            .expect("PROJECT_REVISION_OVERFLOW"));
        record.updated_at_ns = U64(env::block_timestamp());
        let record = record.clone();
        Self::emit_project(&record);
        record
    }

    pub fn get_project(&self, project_id: String) -> Option<Project> {
        Self::assert_id(&project_id);
        self.projects.get(&project_id).cloned()
    }

    pub fn get_projects(&self, from_index: u32, limit: u32) -> Vec<Project> {
        require!(limit > 0 && limit <= MAX_PAGE_SIZE, "INVALID_PAGE_SIZE");
        self.project_ids
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|id| {
                self.projects
                    .get(id)
                    .expect("PROJECT_INDEX_INVARIANT")
                    .clone()
            })
            .collect()
    }
}

impl RunLatch {
    fn emit_project(project: &Project) {
        let event = near_sdk::serde_json::json!({"standard":"runlatch","version":"2.0.0","event":"project_authority",
            "data":[{"project_id":project.input.project_id,"revision":project.revision,"status":project.status}]});
        env::log_str(&format!("EVENT_JSON:{event}"));
    }
}
