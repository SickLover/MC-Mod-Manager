use crate::types::ResourceItem;

/// 合并 CurseForge + Modrinth 结果，按 downloadCount 降序，source-id 去重
pub fn merge_results(cf: &[ResourceItem], mr: &[ResourceItem]) -> Vec<ResourceItem> {
    let mut combined: Vec<ResourceItem> = Vec::with_capacity(cf.len() + mr.len());
    combined.extend_from_slice(cf);
    combined.extend_from_slice(mr);

    // 按 downloadCount 降序
    combined.sort_by(|a, b| b.download_count.cmp(&a.download_count));

    // source-id 去重
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for item in combined {
        let key = format!("{}-{}", item.source, item.id);
        if seen.insert(key) {
            result.push(item);
        }
    }

    result
}
