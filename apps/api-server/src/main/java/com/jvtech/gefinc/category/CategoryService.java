package com.jvtech.gefinc.category;

import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.transaction.TransactionGroupRepository;
import com.jvtech.gefinc.transaction.TransactionRepository;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {

  /** Prévia da exclusão de uma categoria. */
  public record CategoryUsage(boolean canDelete, long transactionCount, long groupCount) {}

  private final CategoryRepository categories;
  private final TransactionRepository transactions;
  private final TransactionGroupRepository groups;

  public CategoryService(
      CategoryRepository categories,
      TransactionRepository transactions,
      TransactionGroupRepository groups) {
    this.categories = categories;
    this.transactions = transactions;
    this.groups = groups;
  }

  @Transactional(readOnly = true)
  public List<Category> list(long userId, CategoryType type) {
    return type == null
        ? categories.findAllOfUser(userId)
        : categories.findAllOfUserByType(userId, type);
  }

  @Transactional
  public Category create(long userId, String name, CategoryType type, String colorHex) {
    String trimmed = name.strip();
    assertNameFree(userId, type, trimmed, null);
    try {
      return categories.saveAndFlush(new Category(userId, trimmed, type, colorHex));
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
  }

  @Transactional
  public Category update(long userId, long id, String name, CategoryType type, String colorHex) {
    Category category = get(userId, id);
    if (type != category.getType()) {
      throw ApiException.validation("O tipo da categoria não pode ser alterado.")
          .withFieldError("type", "O tipo da categoria não pode ser alterado.");
    }
    String trimmed = name.strip();
    assertNameFree(userId, category.getType(), trimmed, category.getId());
    category.update(trimmed, colorHex);
    try {
      return categories.saveAndFlush(category);
    } catch (DataIntegrityViolationException e) {
      throw nameTaken();
    }
  }

  /** Prévia da exclusão: quantos lançamentos e grupos usam a categoria. */
  @Transactional(readOnly = true)
  public CategoryUsage usage(long userId, long id) {
    get(userId, id);
    return usageOf(userId, id);
  }

  /**
   * Exclui a categoria somente se nenhum lançamento nem grupo a usa. Em uso, a resposta é {@code
   * 409}: o usuário precisa alterar a categoria desses lançamentos antes (FR-016).
   */
  @Transactional
  public void delete(long userId, long id) {
    Category category = get(userId, id);
    CategoryUsage usage = usageOf(userId, id);
    if (!usage.canDelete()) {
      long shown = Math.max(usage.transactionCount(), usage.groupCount());
      throw new ApiException(
              ErrorCode.CATEGORY_IN_USE,
              "Esta categoria não pode ser excluída: está em uso em "
                  + shown
                  + (shown == 1 ? " lançamento" : " lançamentos")
                  + ". Altere a categoria desses lançamentos e tente novamente.")
          .with("transactionCount", usage.transactionCount())
          .with("groupCount", usage.groupCount());
    }
    try {
      categories.delete(category);
      categories.flush();
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(
          ErrorCode.CATEGORY_IN_USE,
          "Esta categoria passou a ter lançamentos. Altere a categoria deles e tente novamente.");
    }
  }

  private CategoryUsage usageOf(long userId, long id) {
    long transactionCount = transactions.countByCategory(userId, id);
    long groupCount = groups.countByCategory(userId, id);
    return new CategoryUsage(transactionCount + groupCount == 0, transactionCount, groupCount);
  }

  private Category get(long userId, long id) {
    return categories
        .findByIdAndUserId(id, userId)
        .orElseThrow(() -> ApiException.notFound("Categoria não encontrada."));
  }

  private void assertNameFree(long userId, CategoryType type, String name, Long excludeId) {
    if (categories.nameExists(userId, type, name, excludeId)) {
      throw nameTaken();
    }
  }

  private static ApiException nameTaken() {
    return new ApiException(
        ErrorCode.CATEGORY_NAME_TAKEN, "Já existe uma categoria com este nome.");
  }
}
