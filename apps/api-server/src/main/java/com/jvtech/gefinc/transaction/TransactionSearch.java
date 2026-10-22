package com.jvtech.gefinc.transaction;

import com.jvtech.gefinc.category.CategoryType;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

/** Listagem filtrada e paginada de lançamentos, sempre restrita ao usuário (Princípio III). */
@Repository
class TransactionSearch {

  record Filter(
      YearMonth month,
      Long accountId,
      Long categoryId,
      CategoryType kind,
      RecurrenceType recurrenceType,
      TransactionStatus status) {}

  record Row(Transaction transaction, TransactionGroup group) {}

  record Result(List<Row> rows, long total) {}

  @PersistenceContext private EntityManager em;

  Result search(long userId, Filter filter, int page, int size) {
    StringBuilder where =
        new StringBuilder(
            " from Transaction t, TransactionGroup g where g.id = t.groupId and g.userId = t.userId"
                + " and t.userId = :userId");
    List<Object[]> params = new ArrayList<>();
    if (filter.month() != null) {
      where.append(" and t.referenceMonth = :month");
      params.add(new Object[] {"month", filter.month().atDay(1)});
    }
    if (filter.accountId() != null) {
      where.append(" and t.accountId = :accountId");
      params.add(new Object[] {"accountId", filter.accountId()});
    }
    if (filter.categoryId() != null) {
      where.append(" and t.categoryId = :categoryId");
      params.add(new Object[] {"categoryId", filter.categoryId()});
    }
    if (filter.kind() != null) {
      where.append(
          " and t.categoryId in (select c.id from Category c where c.userId = :userId"
              + " and c.type = :kind)");
      params.add(new Object[] {"kind", filter.kind()});
    }
    if (filter.recurrenceType() != null) {
      where.append(" and g.recurrenceType = :recurrence");
      params.add(new Object[] {"recurrence", filter.recurrenceType()});
    }
    if (filter.status() != null) {
      where.append(" and t.status = :status");
      params.add(new Object[] {"status", filter.status()});
    }

    Query count = em.createQuery("select count(t)" + where);
    Query select =
        em.createQuery("select t, g" + where + " order by t.dueDate, t.id")
            .setFirstResult(page * size)
            .setMaxResults(size);
    for (Query query : new Query[] {count, select}) {
      query.setParameter("userId", userId);
      for (Object[] param : params) {
        query.setParameter((String) param[0], param[1]);
      }
    }
    long total = (Long) count.getSingleResult();
    List<Row> rows = new ArrayList<>();
    for (Object result : select.getResultList()) {
      Object[] pair = (Object[]) result;
      rows.add(new Row((Transaction) pair[0], (TransactionGroup) pair[1]));
    }
    return new Result(rows, total);
  }
}
